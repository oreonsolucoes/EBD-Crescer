// scanner.js — Geração e LEITURA de QR Code
// Usa tag <script> com onload para garantir que a lib está pronta antes de usar.

export function urlMatriculaTurma(turmaCodigo) {
  const base = location.href.replace(/[^/]*$/, "");
  return `${base}matricula.html?turma=${encodeURIComponent(turmaCodigo)}`;
}
export const urlPresencaTurma = urlMatriculaTurma;

// ---------- Geração de QR ----------
let _qrLoaded = false;
function carregarQR() {
  return new Promise((resolve, reject) => {
    if (_qrLoaded && window.QRCode) { resolve(window.QRCode); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
    s.onload = () => { _qrLoaded = true; resolve(window.QRCode); };
    s.onerror = () => reject(new Error("Falha ao carregar QRCode.js"));
    document.head.appendChild(s);
  });
}

export async function desenharQR(canvas, texto, tamanho = 220) {
  if (!canvas) return;
  const QR = await carregarQR();
  await QR.toCanvas(canvas, texto, {
    width: tamanho, margin: 1,
    color: { dark: "#1C2230", light: "#FFFFFF" },
  });
}

export async function qrDataURL(texto, tamanho = 512) {
  const QR = await carregarQR();
  return QR.toDataURL(texto, { width: tamanho, margin: 2 });
}

// ---------- Leitura pela câmera ----------
let _scannerLib = null;
async function carregarLeitor() {
  if (_scannerLib) return _scannerLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  _scannerLib = window.Html5Qrcode;
  return _scannerLib;
}

export async function iniciarLeitor(elementId, onSucesso, onErro) {
  const Lib = await carregarLeitor();
  const leitor = new Lib(elementId);
  try {
    await leitor.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (texto) => { leitor.stop().catch(() => {}); onSucesso(texto); },
      () => {}
    );
  } catch (err) {
    if (onErro) onErro(err.message || String(err));
  }
  return leitor;
}

export async function pararLeitor(leitor) {
  if (!leitor) return;
  try { await leitor.stop(); } catch (_) {}
}
