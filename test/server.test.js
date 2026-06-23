const test = require("node:test");
const assert = require("node:assert/strict");
const { server, normalizeId } = require("../server");

test("normalizes certificate IDs", () => {
  assert.equal(normalizeId(" cert-2026-a7k9q2 "), "CERT-2026-A7K9Q2");
});

test("returns completion status from the registry", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/certificates/CERT-2026-08421`
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.verified, true);
    assert.equal(body.certificate.status, "completed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("authenticates an official QR URL and verifies completion", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const qrContent = `http://127.0.0.1:${port}/issuer/certificates/CERT-2026-08421?token=vf_8xp3Qm2L`;
    const response = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "qr", qrContent })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.outcome, "verified");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects a QR URL from an unofficial website", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "qr",
        qrContent: "https://fake.example/issuer/certificates/CERT-2026-08421?token=vf_8xp3Qm2L"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.outcome, "untrusted");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects unknown certificate IDs", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/certificates/DOES-NOT-EXIST`
    );
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.verified, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
