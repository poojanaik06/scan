const http = require("http");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const registryPath = path.join(__dirname, "data", "certificates.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function getCertificates() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function getCertificate(certificateId) {
  const normalizedId = normalizeId(certificateId);
  return getCertificates().find(item => item.certificateId === normalizedId);
}

function requestOrigin(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${port}`;
  return `${protocol}://${host}`;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 100_000) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function verificationResult(record) {
  if (record.status === "completed") {
    return {
      outcome: "verified",
      title: "Course completion verified",
      message: "This certificate matches the issuer registry and the course is marked complete."
    };
  }

  if (record.status === "revoked") {
    return {
      outcome: "revoked",
      title: "Certificate revoked",
      message: "The certificate exists, but the issuer has revoked this credential."
    };
  }

  return {
    outcome: "incomplete",
    title: "Course not completed",
    message: `The learner has completed ${record.progress}% of this course. A valid certificate has not been issued.`
  };
}

function parseQrContent(content, request) {
  const value = String(content || "").trim();
  if (!value) return {};

  if (value.startsWith("{")) {
    const payload = JSON.parse(value);
    return {
      certificateId: payload.certificateId || payload.id,
      verificationCode: payload.verificationCode || payload.token
    };
  }

  if (!/^https?:\/\//i.test(value)) {
    return { certificateId: value };
  }

  const qrUrl = new URL(value);
  const expectedOrigin = new URL(requestOrigin(request));
  const pathMatch = qrUrl.pathname.match(/^\/issuer\/certificates\/([^/]+)\/?$/);

  if (qrUrl.origin !== expectedOrigin.origin || !pathMatch) {
    const error = new Error("This QR does not point to this issuer's official certificate page.");
    error.code = "UNTRUSTED_QR_URL";
    throw error;
  }

  return {
    certificateId: decodeURIComponent(pathMatch[1]),
    verificationCode: qrUrl.searchParams.get("token")
  };
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/verify") {
    try {
      const body = await readBody(request);
      const source = body.source === "qr" ? "qr" : "manual";
      const parsed = source === "qr"
        ? parseQrContent(body.qrContent || JSON.stringify({
          certificateId: body.certificateId,
          verificationCode: body.verificationCode
        }), request)
        : { certificateId: body.certificateId };
      const record = getCertificate(parsed.certificateId);

      if (!record) {
        return json(response, 404, {
          ok: false,
          outcome: "not_found",
          title: "Certificate not found",
          message: "No matching certificate exists in the issuer registry."
        });
      }

      if (source === "qr" && parsed.verificationCode !== record.verificationCode) {
        return json(response, 403, {
          ok: false,
          outcome: "tampered",
          title: "QR code could not be authenticated",
          message: "The certificate ID exists, but the QR verification code does not match."
        });
      }

      const result = verificationResult(record);
      const { verificationCode: _, ...publicRecord } = record;
      const officialUrl = `${requestOrigin(request)}/issuer/certificates/${encodeURIComponent(record.certificateId)}`;
      return json(response, 200, {
        ok: result.outcome === "verified",
        checkedAt: new Date().toISOString(),
        source,
        officialUrl,
        verificationMethod: source === "qr"
          ? "Authenticated official issuer URL and live issuer registry"
          : "Live issuer registry lookup",
        ...result,
        certificate: publicRecord
      });
    } catch (error) {
      if (error.code === "UNTRUSTED_QR_URL") {
        return json(response, 400, {
          ok: false,
          outcome: "untrusted",
          title: "Unofficial certificate link",
          message: error.message
        });
      }
      return json(response, 400, {
        ok: false,
        outcome: "error",
        title: "Invalid request",
        message: "The verification request could not be read."
      });
    }
  }

  const qrMatch = url.pathname.match(/^\/api\/certificates\/([^/]+)\/qr$/);
  if (request.method === "GET" && qrMatch) {
    const record = getCertificate(decodeURIComponent(qrMatch[1]));
    if (!record) return json(response, 404, { message: "Certificate not found" });

    const verificationUrl = `${requestOrigin(request)}/issuer/certificates/${encodeURIComponent(record.certificateId)}?token=${encodeURIComponent(record.verificationCode)}`;
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-store"
    });
    return QRCode.toFileStream(response, verificationUrl, {
      width: 360,
      margin: 2,
      color: { dark: "#101828", light: "#ffffff" }
    });
  }

  const certificateMatch = url.pathname.match(/^\/api\/certificates\/([^/]+)$/);
  if (request.method === "GET" && certificateMatch) {
    const record = getCertificate(decodeURIComponent(certificateMatch[1]));
    if (!record) {
      return json(response, 404, {
        verified: false,
        outcome: "not_found",
        message: "Certificate not found"
      });
    }
    const result = verificationResult(record);
    const { verificationCode: _, ...publicRecord } = record;
    return json(response, 200, {
      verified: result.outcome === "verified",
      outcome: result.outcome,
      certificate: publicRecord
    });
  }

  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serveIssuerPage(request, response, url) {
  const match = url.pathname.match(/^\/issuer\/certificates\/([^/]+)\/?$/);
  if (!match) return false;

  const record = getCertificate(decodeURIComponent(match[1]));
  if (!record) {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<h1>Certificate not found</h1>");
    return true;
  }

  const result = verificationResult(record);
  const isAuthenticLink = url.searchParams.get("token") === record.verificationCode;
  const statusText = result.outcome === "verified"
    ? "Completed and verified"
    : result.outcome === "revoked" ? "Revoked" : "Course incomplete";
  const color = result.outcome === "verified" ? "#1f6c4b" : result.outcome === "revoked" ? "#a83a32" : "#a76616";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(record.certificateId)} — Official certificate</title>
<meta name="certificate-status" content="${escapeHtml(record.status)}">
<style>body{margin:0;background:#f3f0e7;color:#14211c;font:16px system-ui,sans-serif}.card{max-width:720px;margin:8vh auto;padding:42px;background:#fffefa;border:1px solid #dcd9cf;border-radius:20px;box-shadow:0 24px 70px #1b30261a}small{letter-spacing:.14em;text-transform:uppercase;color:#68716c}h1{font-size:38px;margin:.35em 0}.status{display:inline-block;padding:8px 12px;border-radius:99px;background:${color}18;color:${color};font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:34px 0;padding:28px 0;border-block:1px solid #dcd9cf}.grid div{display:grid;gap:5px}.warning{color:#a83a32}a{color:#1f6c4b}@media(max-width:700px){.card{margin:12px;padding:25px}.grid{grid-template-columns:1fr}}</style>
</head><body><main class="card">
<small>Northstar Learning Institute · Official record</small>
<h1>${escapeHtml(record.courseName)}</h1>
<p class="status">${statusText}</p>
${url.searchParams.has("token") && !isAuthenticLink ? '<p class="warning">Warning: the verification token in this link is invalid.</p>' : ""}
<section class="grid">
<div><small>Learner</small><strong>${escapeHtml(record.learnerName)}</strong></div>
<div><small>Certificate ID</small><strong>${escapeHtml(record.certificateId)}</strong></div>
<div><small>Progress</small><strong>${escapeHtml(record.progress)}%</strong></div>
<div><small>Completed on</small><strong>${escapeHtml(record.completedOn || "Not completed")}</strong></div>
</section>
<p>${escapeHtml(result.message)}</p>
<p><a href="/">Verify another certificate with CertiScan</a></p>
</main></body></html>`;
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(html);
  return true;
}

function serveFile(response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Not found");
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (handled === false) json(response, 404, { message: "API route not found" });
    return;
  }

  if (serveIssuerPage(request, response, url)) return;

  if (url.pathname === "/vendor/jsQR.js") {
    return serveFile(response, path.join(__dirname, "node_modules", "jsqr", "dist", "jsQR.js"));
  }

  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  serveFile(response, path.join(publicDir, safePath));
});

if (require.main === module) {
  server.listen(port, () => {
    console.log(`CertiScan is running at http://localhost:${port}`);
  });
}

module.exports = { server, normalizeId, parseQrContent };
