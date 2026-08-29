// app-leitor.js — Página de leitura de QR pela câmera (leitor.html)
// O aluno aponta o celular para o QR fixo da turma.
// Ao ler, é redirecionado para matricula.html?turma=XXXX.
import { iniciarLeitor, pararLeitor } from "./scanner.js";

const $ = (s) => document.querySelector(s);
let leitorAtivo = null;

async function iniciar() {
  const statusEl = $("#status");
  statusEl.textContent = "Iniciando câmera…";
  try {
    leitorAtivo = await iniciarLeitor(
      "qr-reader",
      (texto) => {
        // valida que é uma URL do nosso sistema com ?turma=
        try {
          const url = new URL(texto);
          const turma = url.searchParams.get("turma");
          if (turma) {
            statusEl.innerHTML = `<span style="color:var(--verde)">QR lido! Redirecionando…</span>`;
            setTimeout(() => { location.href = texto; }, 600);
            return;
          }
        } catch (_) {}
        // QR não reconhecido: avisa mas deixa continuar tentando
        statusEl.innerHTML = `<span style="color:var(--alerta)">QR não reconhecido. Aponte para o QR da turma EBD.</span>`;
        // reinicia o leitor após 2s
        setTimeout(() => iniciar(), 2000);
      },
      (erro) => {
        statusEl.innerHTML = `
          <div class="aviso perigo">
            Não foi possível acessar a câmera: <strong>${erro}</strong><br>
            Verifique as permissões do navegador ou use o link direto abaixo.
          </div>`;
        $("#fallback").hidden = false;
      }
    );
    statusEl.textContent = "Aponte a câmera para o QR Code da turma.";
  } catch (err) {
    statusEl.innerHTML = `<div class="aviso perigo">Erro: ${err.message}</div>`;
    $("#fallback").hidden = false;
  }
}

// Fallback: digitar o código da turma manualmente
$("#form-manual").addEventListener("submit", (e) => {
  e.preventDefault();
  const turma = $("#in-turma").value.trim().toUpperCase();
  if (turma) location.href = `matricula.html?turma=${encodeURIComponent(turma)}`;
});

iniciar();
