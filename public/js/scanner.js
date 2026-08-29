// scanner.js — Geração e LEITURA de QR Code (Sprints 5 e 6).
// Geração: biblioteca 'qrcode' via CDN.
// Leitura (câmera): biblioteca 'html5-qrcode' via CDN.
// Ambas carregadas sob demanda — não impactam o carregamento inicial.
// -----------------------------------------------------------------------------

// Monta a URL de matrícula de uma turma (QR fixo por turma).
export function urlMatriculaTurma(turmaCodigo) {
  const base = location.href.replace(/[^/]*$/, "");
  return `${base}matricula.html?turma=${encodeURIComponent(turmaCodigo)}`;
}

// Mantém alias antigo para não quebrar app-professor.js existente
export const urlPresencaTurma = urlMatriculaTurma;

// ---------- Geração ----------
let _qrlib = null;
async function carregarQR() {
  if (_qrlib) return _qrlib;
  await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js");
  _qrlib = window.QRCode;
  return _qrlib;
}

export async function desenharQR(canvas, texto, tamanho = 220) {
  const QR = await carregarQR();
  await QR.toCanvas(canvas, texto, {
    width: tamanho,
    margin: 1,
    color: { dark: "#1C2230", light: "#FFFFFF" },
  });
}

export async function qrDataURL(texto, tamanho = 512) {
  const QR = await carregarQR();
  return QR.toDataURL(texto, { width: tamanho, margin: 2 });
}

// ---------- Leitura pela câmera (Sprint 5) ----------
// A biblioteca html5-qrcode expõe `Html5QrcodeScanner` no window global.
let _scannerLib = null;
async function carregarLeitor() {
  if (_scannerLib) return _scannerLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  _scannerLib = window.Html5Qrcode;
  return _scannerLib;
}

// Inicia a câmera num elemento com id `elementId`.
// onSucesso(texto) é chamado uma vez ao ler; onErro(msg) em falha de câmera.
// Retorna uma instância que o chamador pode usar para parar o leitor.
export async function iniciarLeitor(elementId, onSucesso, onErro) {
  const Lib = await carregarLeitor();
  const leitor = new Lib(elementId);
  try {
    await leitor.start(
      { facingMode: "environment" }, // câmera traseira
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (texto) => {
        // Para o leitor assim que lê com sucesso (evita múltiplas leituras)
        leitor.stop().catch(() => {});
        onSucesso(texto);
      },
      () => {} // erros de frame são normais; ignoramos
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
