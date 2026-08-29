// app-cartao.js — Cartão digital do aluno (cartao.html)
// URL: cartao.html?codigo=EBD-0001
// Exibe nome, código EBD-XXXX, foto opcional e QR Code do aluno.
// Permite baixar o cartão como PNG via canvas.
import { buscarAluno } from "./db.js";
import { qrDataURL } from "./scanner.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const codigo = (params.get("codigo") || "").trim().toUpperCase();

const elErro = $("#erro");
const elCartao = $("#cartao");

function esc(s) { return (s ?? "").toString().replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function iniciar() {
  if (!codigo) { elErro.innerHTML = '<div class="aviso perigo">Código do aluno não informado.</div>'; return; }

  const aluno = await buscarAluno(codigo);
  if (!aluno) { elErro.innerHTML = '<div class="aviso perigo">Aluno não encontrado.</div>'; return; }

  // URL que o QR do aluno encoda (área do aluno)
  const base = location.href.replace(/[^/]*$/, "");
  const urlAluno = `${base}area.html?cpf=${encodeURIComponent(aluno.cpf || codigo)}`;
  const qrSrc = await qrDataURL(urlAluno, 300);

  // Monta o cartão visualmente
  renderCartao(aluno, qrSrc);
}

function renderCartao(aluno, qrSrc) {
  elCartao.hidden = false;
  $("#card-nome").textContent = aluno.nome;
  $("#card-codigo").textContent = aluno.codigo;
  $("#card-qr").src = qrSrc;
  $("#card-qr").alt = `QR Code de ${aluno.nome}`;

  // Foto opcional (upload local — só pré-visualização, não é salva no Firebase neste Sprint)
  const inputFoto = $("#input-foto");
  inputFoto.addEventListener("change", () => {
    const file = inputFoto.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { $("#card-foto").src = e.target.result; $("#card-foto").hidden = false; };
    reader.readAsDataURL(file);
  });

  // Botão de download: renderiza o cartão num canvas e baixa como PNG
  $("#btn-baixar").addEventListener("click", () => baixarCartao(aluno, qrSrc));
}

async function baixarCartao(aluno, qrSrc) {
  const canvas = document.createElement("canvas");
  const W = 600, H = 360;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fundo
  ctx.fillStyle = "#1C2230"; // indigo escuro
  ctx.fillRect(0, 0, W, H);

  // Faixa âmbar
  ctx.fillStyle = "#C6862B";
  ctx.fillRect(0, H - 8, W, 8);

  // Faixa lateral esquerda (acento)
  ctx.fillStyle = "#C6862B";
  ctx.fillRect(0, 0, 6, H);

  // Logotipo / selo
  ctx.fillStyle = "#C6862B";
  ctx.strokeStyle = "#C6862B";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(32, 30, 56, 56, 10);
  ctx.stroke();
  ctx.fillStyle = "#C6862B";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("EBD", 60, 62);

  // Nome da instituição
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Igreja Batista da Cidade — IBC", 110, 48);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("Escola Bíblica Dominical", 110, 68);

  // Separador
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(32, 108); ctx.lineTo(W - 32, 108); ctx.stroke();

  // Nome do aluno
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "left";
  // trunca se muito longo
  const nomeExibido = aluno.nome.length > 28 ? aluno.nome.slice(0, 27) + "…" : aluno.nome;
  ctx.fillText(nomeExibido, 32, 150);

  // Código EBD
  ctx.fillStyle = "#C6862B";
  ctx.font = "bold 18px monospace";
  ctx.fillText(aluno.codigo, 32, 182);

  // Label
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px sans-serif";
  ctx.fillText("IDENTIFICAÇÃO DO ALUNO", 32, 210);

  // Validade / turno
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px sans-serif";
  ctx.fillText("Cartão gerado em " + new Date().toLocaleDateString("pt-BR"), 32, H - 26);

  // Foto (se houver)
  const fotoEl = $("#card-foto");
  if (!fotoEl.hidden && fotoEl.src) {
    const img = new Image();
    img.src = fotoEl.src;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    ctx.save();
    ctx.beginPath();
    ctx.arc(W - 120, H / 2, 64, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, W - 184, H / 2 - 64, 128, 128);
    ctx.restore();
  }

  // QR Code
  const qrImg = new Image();
  qrImg.src = qrSrc;
  await new Promise((r) => { qrImg.onload = r; qrImg.onerror = r; });
  // posiciona o QR no canto direito
  const qrX = aluno.nome.length > 20 ? W - 168 : W - 160;
  const qrSize = fotoEl.hidden ? 130 : 90; // QR menor se houver foto
  const qrY = H - qrSize - 40;
  // fundo branco p/ o QR
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 8);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // download
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `cartao-${aluno.codigo}.png`;
  a.click();
}

iniciar();
