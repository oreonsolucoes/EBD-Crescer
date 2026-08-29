// app-cartao.js — Cartão digital do aluno (cartao.html)
// URL: cartao.html?codigo=EBD-0001
import { buscarAluno } from "./db.js";
import { qrDataURL } from "./scanner.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const codigo = (params.get("codigo") || "").trim().toUpperCase();

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function mostrarErro(msg) {
  const el = document.getElementById("erro");
  if (el) el.innerHTML = `<div class="aviso perigo">${msg}</div>`;
}

// Aguarda o Firebase Auth inicializar (resolve com user ou null)
function aguardarAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function iniciar() {
  if (!codigo) {
    mostrarErro("Código do aluno não informado na URL.");
    return;
  }

  // Aguarda o Firebase Auth inicializar antes de acessar o Firestore
  await aguardarAuth();

  let aluno;
  try {
    aluno = await buscarAluno(codigo);
  } catch (err) {
    mostrarErro("Erro ao buscar aluno: " + err.message);
    return;
  }

  if (!aluno) {
    mostrarErro(`Aluno ${esc(codigo)} não encontrado.`);
    return;
  }

  // QR do aluno aponta para a área de frequência
  const base = location.href.replace(/[^/]*$/, "");
  const urlAluno = `${base}area.html?cpf=${encodeURIComponent(aluno.cpf || codigo)}`;

  let qrSrc = "";
  try {
    qrSrc = await qrDataURL(urlAluno, 300);
  } catch (err) {
    console.warn("QR não gerado:", err);
  }

  renderCartao(aluno, qrSrc);
}

function renderCartao(aluno, qrSrc) {
  const elCartao = document.getElementById("cartao");
  if (elCartao) elCartao.hidden = false;

  const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setTxt("#card-nome",   aluno.nome);
  setTxt("#card-codigo", aluno.codigo);

  const qrEl = $("#card-qr");
  if (qrEl && qrSrc) {
    qrEl.src = qrSrc;
    qrEl.alt = `QR Code de ${aluno.nome}`;
  } else if (qrEl) {
    qrEl.style.display = "none";
  }

  // Foto opcional
  const inputFoto = $("#input-foto");
  if (inputFoto) {
    inputFoto.addEventListener("change", () => {
      const file = inputFoto.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const fotoEl = $("#card-foto");
        if (fotoEl) { fotoEl.src = e.target.result; fotoEl.hidden = false; }
      };
      reader.readAsDataURL(file);
    });
  }

  const btnBaixar = $("#btn-baixar");
  if (btnBaixar) btnBaixar.addEventListener("click", () => baixarCartao(aluno, qrSrc));
}

async function baixarCartao(aluno, qrSrc) {
  const canvas = document.createElement("canvas");
  const W = 600, H = 360;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fundo
  ctx.fillStyle = "#1C2230";
  ctx.fillRect(0, 0, W, H);

  // Faixa âmbar inferior
  ctx.fillStyle = "#C6862B";
  ctx.fillRect(0, H - 8, W, 8);

  // Faixa lateral esquerda
  ctx.fillStyle = "#C6862B";
  ctx.fillRect(0, 0, 6, H);

  // Logo
  try {
    const logoImg = new Image();
    logoImg.src = location.href.replace(/[^/]*$/, "") + "img/logo-header.png";
    await new Promise((r) => { logoImg.onload = r; logoImg.onerror = r; });
    if (logoImg.naturalWidth) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(26, 24, 130, 50, 8);
      else ctx.rect(26, 24, 130, 50);
      ctx.fill();
      ctx.drawImage(logoImg, 30, 28, 122, 42);
    }
  } catch (_) {}

  // Separador
  ctx.strokeStyle = "rgba(255,255,255,.15)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(32, 90); ctx.lineTo(W - 32, 90); ctx.stroke();

  // Nome
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "left";
  const nomeExibido = aluno.nome.length > 28 ? aluno.nome.slice(0, 27) + "…" : aluno.nome;
  ctx.fillText(nomeExibido, 32, 135);

  // Código
  ctx.fillStyle = "#C6862B";
  ctx.font = "bold 18px monospace";
  ctx.fillText(aluno.codigo, 32, 165);

  // Label
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = "11px sans-serif";
  ctx.fillText("CARTÃO DE IDENTIFICAÇÃO — EBD IBC", 32, 190);

  // Data
  ctx.fillText("Emitido em " + new Date().toLocaleDateString("pt-BR"), 32, H - 20);

  // Foto (se houver)
  const fotoEl = $("#card-foto");
  if (fotoEl && !fotoEl.hidden && fotoEl.src) {
    try {
      const img = new Image();
      img.src = fotoEl.src;
      await new Promise((r) => { img.onload = r; img.onerror = r; });
      ctx.save();
      ctx.beginPath();
      ctx.arc(W - 110, H / 2, 60, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, W - 170, H / 2 - 60, 120, 120);
      ctx.restore();
    } catch (_) {}
  }

  // QR Code
  if (qrSrc) {
    try {
      const qrImg = new Image();
      qrImg.src = qrSrc;
      await new Promise((r) => { qrImg.onload = r; qrImg.onerror = r; });
      const qrSize = 110;
      const qrX = W - qrSize - 30;
      const qrY = H - qrSize - 30;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 8);
      else ctx.rect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch (_) {}
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `cartao-${aluno.codigo}.png`;
  a.click();
}

iniciar();
