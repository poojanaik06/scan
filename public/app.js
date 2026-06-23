const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const cameraButton = document.querySelector("#camera-button");
const camera = document.querySelector("#camera");
const canvas = document.querySelector("#scan-canvas");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const scannerShell = document.querySelector(".scanner-shell");
const uploadZone = document.querySelector("#upload-zone");
const fileInput = document.querySelector("#file-input");
const manualForm = document.querySelector("#manual-form");
const message = document.querySelector("#message");
const resultCard = document.querySelector("#result-card");
const certificateDetails = document.querySelector("#certificate-details");

let stream;
let scanning = false;
let scanFrame;

tabs.forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function switchTab(name) {
  tabs.forEach(tab => {
    const selected = tab.dataset.tab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", selected);
  });
  panels.forEach(panel => panel.classList.toggle("active", panel.id === `${name}-panel`));
  clearMessage();
  if (name !== "scan") stopCamera();
}

function setMessage(text) {
  message.textContent = text;
  message.classList.add("show");
}

function clearMessage() {
  message.textContent = "";
  message.classList.remove("show");
}

cameraButton.addEventListener("click", async () => {
  if (scanning) {
    stopCamera();
    return;
  }

  clearMessage();
  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage("Camera access is not available in this browser. Upload an image instead.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false
    });
    camera.srcObject = stream;
    await camera.play();
    camera.style.display = "block";
    cameraPlaceholder.style.display = "none";
    scannerShell.classList.add("camera-live");
    cameraButton.textContent = "Stop camera";
    scanning = true;
    scanCameraFrame();
  } catch (error) {
    setMessage("Camera permission was denied or no camera was found. You can upload a QR image instead.");
  }
});

function stopCamera() {
  scanning = false;
  cancelAnimationFrame(scanFrame);
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  camera.srcObject = null;
  camera.style.display = "none";
  cameraPlaceholder.style.display = "flex";
  scannerShell.classList.remove("camera-live");
  cameraButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4V7Zm8 9.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>Start camera';
}

function scanCameraFrame() {
  if (!scanning) return;
  if (camera.readyState === camera.HAVE_ENOUGH_DATA && camera.videoWidth) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / camera.videoWidth);
    canvas.width = camera.videoWidth * scale;
    canvas.height = camera.videoHeight * scale;
    context.drawImage(camera, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = window.jsQR?.(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });
    if (qr?.data) {
      stopCamera();
      processQrContent(qr.data);
      return;
    }
  }
  scanFrame = requestAnimationFrame(scanCameraFrame);
}

["dragenter", "dragover"].forEach(eventName => {
  uploadZone.addEventListener(eventName, event => {
    event.preventDefault();
    uploadZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(eventName => {
  uploadZone.addEventListener(eventName, event => {
    event.preventDefault();
    uploadZone.classList.remove("dragging");
  });
});

uploadZone.addEventListener("drop", event => {
  const [file] = event.dataTransfer.files;
  if (file) scanImage(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) scanImage(fileInput.files[0]);
});

function scanImage(file) {
  clearMessage();
  if (!file.type.startsWith("image/")) {
    setMessage("Please choose an image file containing a QR code.");
    return;
  }

  const image = new Image();
  image.onload = () => {
    const maxSize = 1800;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = window.jsQR?.(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth"
    });
    URL.revokeObjectURL(image.src);
    if (!qr?.data) {
      setMessage("No readable QR code was found. Try a clearer or more tightly cropped image.");
      return;
    }
    processQrContent(qr.data);
  };
  image.onerror = () => setMessage("That image could not be opened.");
  image.src = URL.createObjectURL(file);
}

function processQrContent(content) {
  verifyCertificate(null, null, "qr", content);
}

manualForm.addEventListener("submit", event => {
  event.preventDefault();
  const id = new FormData(manualForm).get("certificateId");
  if (!String(id).trim()) {
    setMessage("Enter a certificate ID to continue.");
    return;
  }
  verifyCertificate(id, null, "manual");
});

async function verifyCertificate(certificateId, verificationCode, source, qrContent) {
  clearMessage();
  resultCard.hidden = true;

  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateId, verificationCode, source, qrContent })
    });
    const result = await response.json();
    renderResult(result);
  } catch (error) {
    setMessage("The registry could not be reached. Check your connection and try again.");
  }
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResult(result) {
  resultCard.hidden = false;
  resultCard.dataset.outcome = result.outcome;
  document.querySelector("#result-icon").textContent =
    result.outcome === "verified" ? "✓" : result.outcome === "incomplete" ? "!" : "×";
  document.querySelector("#result-title").textContent = result.title;
  document.querySelector("#result-message").textContent = result.message;

  if (result.certificate) {
    const cert = result.certificate;
    certificateDetails.innerHTML = `
      <div class="detail full"><span>Learner</span><strong>${escapeHtml(cert.learnerName)}</strong></div>
      <div class="detail full"><span>Course</span><strong>${escapeHtml(cert.courseName)}</strong></div>
      <div class="detail"><span>Certificate ID</span><strong>${escapeHtml(cert.certificateId)}</strong></div>
      <div class="detail"><span>Course progress</span><strong>${escapeHtml(cert.progress)}%</strong></div>
      <div class="detail"><span>Completed on</span><strong>${formatDate(cert.completedOn)}</strong></div>
      <div class="detail"><span>Issued by</span><strong>${escapeHtml(cert.issuer)}</strong></div>
      <div class="detail full"><span>Verification method</span><strong>${escapeHtml(result.verificationMethod)}</strong></div>
      ${cert.revocationReason ? `<div class="detail full"><span>Revocation reason</span><strong>${escapeHtml(cert.revocationReason)}</strong></div>` : ""}
      <div class="detail full"><span>Skills</span><div class="skills">${cert.skills.map(skill => `<i>${escapeHtml(skill)}</i>`).join("")}</div></div>
      ${result.officialUrl ? `<div class="detail full"><a class="official-link" href="${escapeHtml(result.officialUrl)}" target="_blank" rel="noopener">Open original issuer page ↗</a></div>` : ""}
    `;
  } else {
    certificateDetails.innerHTML = "";
  }

  document.querySelector("#checked-time").textContent = result.checkedAt
    ? `Checked ${new Date(result.checkedAt).toLocaleString()}`
    : "Registry check unsuccessful";
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetVerifier() {
  resultCard.hidden = true;
  manualForm.reset();
  fileInput.value = "";
  clearMessage();
  switchTab("scan");
  document.querySelector(".verifier-card").scrollIntoView({ behavior: "smooth", block: "center" });
}

document.querySelector("#close-result").addEventListener("click", () => { resultCard.hidden = true; });
document.querySelector("#verify-another").addEventListener("click", resetVerifier);

document.querySelectorAll(".demo-id").forEach(button => {
  button.addEventListener("click", () => verifyCertificate(button.dataset.id, null, "manual"));
});
