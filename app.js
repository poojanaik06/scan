const form = document.querySelector("#verifyForm");
const input = document.querySelector("#certificateId");
const resultCard = document.querySelector("#resultCard");
const message = document.querySelector("#message");
const startCameraButton = document.querySelector("#startCamera");
const stopCameraButton = document.querySelector("#stopCamera");
const uploadInput = document.querySelector("#qrUpload");
const video = document.querySelector("#camera");
const scannerShell = document.querySelector("#scannerShell");

let stream = null;
let scanTimer = null;
let detector = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function showMessage(text, type = "info") {
  message.textContent = text;
  message.className = `message visible ${type}`;
}

function clearMessage() {
  message.textContent = "";
  message.className = "message";
}

function extractCertificateId(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const fromQuery = parsed.searchParams.get("certificateId") || parsed.searchParams.get("id");
    if (fromQuery) return fromQuery.trim().toUpperCase();
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return decodeURIComponent(pathParts.at(-1) || "").trim().toUpperCase();
  } catch {
    const match = raw.match(/CERT-\d{4}-[A-Z0-9]+/i);
    return (match ? match[0] : raw).trim().toUpperCase();
  }
}

function renderResult(payload) {
  const certificate = payload.certificate;
  const status = certificate.status;
  const display = {
    completed: {
      tone: "success",
      icon: "✓",
      title: "Course completion verified",
      text: "This certificate is authentic and the course is marked complete."
    },
    in_progress: {
      tone: "warning",
      icon: "!",
      title: "Course not yet completed",
      text: "The record exists, but the learner has not completed this course."
    },
    revoked: {
      tone: "danger",
      icon: "×",
      title: "Certificate revoked",
      text: certificate.revocationReason || "The issuer has invalidated this certificate."
    }
  }[status] || {
    tone: "danger",
    icon: "?",
    title: "Unrecognized certificate state",
    text: "Contact the issuing organization for clarification."
  };

  resultCard.innerHTML = `
    <div class="result-banner ${display.tone}">
      <div class="status-icon">${display.icon}</div>
      <div>
        <h3>${escapeHtml(display.title)}</h3>
        <p>${escapeHtml(display.text)}</p>
      </div>
    </div>
    <div class="result-details">
      <div class="person-course">
        <small>Issued to</small>
        <h4>${escapeHtml(certificate.studentName)}</h4>
        <p>${escapeHtml(certificate.courseName)}</p>
      </div>
      <div class="detail-grid">
        <div><small>Certificate ID</small><strong>${escapeHtml(certificate.certificateId)}</strong></div>
        <div><small>Completion date</small><strong>${formatDate(certificate.completedOn)}</strong></div>
        <div><small>Course duration</small><strong>${escapeHtml(certificate.courseHours)} hours</strong></div>
        <div><small>Issuer</small><strong>${escapeHtml(certificate.issuer)}</strong></div>
        <div><small>Final score</small><strong>${certificate.score == null ? "—" : `${escapeHtml(certificate.score)}%`}</strong></div>
        <div><small>Registry check</small><strong>Just now</strong></div>
      </div>
    </div>
  `;
  resultCard.classList.add("visible");
  resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function verifyCertificate(rawId) {
  const id = extractCertificateId(rawId);
  if (!id) {
    showMessage("Enter a certificate ID or scan a valid QR code.", "error");
    return;
  }

  input.value = id;
  clearMessage();
  resultCard.classList.remove("visible");
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Checking…";

  try {
    const response = await fetch(`/api/certificates/${encodeURIComponent(id)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.reason || "Certificate could not be verified.");
    }
    renderResult(payload);
  } catch (error) {
    resultCard.classList.remove("visible");
    showMessage(error.message || "Verification service is unavailable.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Verify now";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  verifyCertificate(input.value);
});

document.querySelectorAll("[data-demo-id]").forEach((button) => {
  button.addEventListener("click", () => verifyCertificate(button.dataset.demoId));
});

function supportsQrDetection() {
  return "BarcodeDetector" in window;
}

async function createDetector() {
  if (!supportsQrDetection()) {
    throw new Error("QR scanning is not supported in this browser. Use Chrome/Edge or enter the certificate ID manually.");
  }
  const formats = await BarcodeDetector.getSupportedFormats();
  if (!formats.includes("qr_code")) {
    throw new Error("This browser cannot read QR codes. Please enter the certificate ID manually.");
  }
  return new BarcodeDetector({ formats: ["qr_code"] });
}

function stopCamera() {
  if (scanTimer) cancelAnimationFrame(scanTimer);
  scanTimer = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  scannerShell.classList.remove("camera-active");
}

async function scanVideoFrame() {
  if (!stream || !detector) return;
  if (video.readyState >= 2) {
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        stopCamera();
        showMessage("QR code read successfully. Checking the issuer registry…");
        await verifyCertificate(codes[0].rawValue);
        return;
      }
    } catch {
      // A frame can fail while the camera is adjusting; keep scanning.
    }
  }
  scanTimer = requestAnimationFrame(scanVideoFrame);
}

startCameraButton.addEventListener("click", async () => {
  clearMessage();
  try {
    detector ||= await createDetector();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    scannerShell.classList.add("camera-active");
    scanVideoFrame();
  } catch (error) {
    stopCamera();
    showMessage(error.message || "Camera access was not available.", "error");
  }
});

stopCameraButton.addEventListener("click", stopCamera);
window.addEventListener("beforeunload", stopCamera);

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files?.[0];
  if (!file) return;
  clearMessage();

  try {
    detector ||= await createDetector();
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    bitmap.close();
    if (!codes.length) {
      throw new Error("No QR code was found in that image. Try a clearer, tightly cropped image.");
    }
    showMessage("QR code read successfully. Checking the issuer registry…");
    await verifyCertificate(codes[0].rawValue);
  } catch (error) {
    showMessage(error.message || "The QR image could not be read.", "error");
  } finally {
    uploadInput.value = "";
  }
});
