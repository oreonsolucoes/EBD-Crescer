// app-area.js — Área do aluno (area.html)
// Busca o aluno por CPF (via URL ou formulário) e exibe histórico de frequência.
import { areaDoAluno } from "./db.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// aceita CPF via URL (vindo do QR do cartão) ou aguarda digitação
let cpfInicial = (params.get("cpf") || "").trim();

function esc(s) { return (s ?? "").toString().replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function corFreq(pct) {
  if (pct === null) return "var(--tinta-2)";
  if (pct >= 75) return "var(--verde)";
  if (pct >= 50) return "var(--ambar)";
  return "var(--alerta)";
}

function barraFreq(pct) {
  if (pct === null) return "";
  const cor = corFreq(pct);
  return `
    <div style="background:var(--linha);border-radius:99px;height:8px;margin-top:6px">
      <div style="width:${pct}%;background:${cor};height:8px;border-radius:99px;transition:width .4s"></div>
    </div>`;
}

async function buscar(cpf) {
  const elResultado = $("#resultado");
  elResultado.innerHTML = '<p class="vazio">Buscando…</p>';
  try {
    const r = await areaDoAluno(cpf);
    if (!r.encontrado) {
      elResultado.innerHTML = '<div class="aviso perigo">CPF não encontrado. Verifique o número ou procure a coordenação.</div>';
      return;
    }
    const { aluno, historico } = r;
    const totalTurmas = historico.length;
    const comAlerta = historico.filter(h => h.alertaBaixa).length;

    elResultado.innerHTML = `
      <div class="cartao">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="selo" style="width:48px;height:48px;font-size:.7rem">${esc(aluno.codigo)}</div>
          <div>
            <h2 style="margin-bottom:2px">${esc(aluno.nome)}</h2>
            <span class="dica mono">${esc(aluno.codigo)}</span>
          </div>
        </div>
        ${comAlerta ? `<div class="aviso" style="margin-top:14px">
          ⚠️ Você tem <strong>${comAlerta}</strong> turma(s) com frequência abaixo de 75%.
          Fale com seu professor ou com a coordenação.
        </div>` : ""}
      </div>

      <div class="cartao">
        <h2>Frequência por turma <span class="contagem">${totalTurmas} matrícula(s)</span></h2>
        ${historico.length === 0 ? '<p class="vazio">Nenhuma matrícula ativa encontrada.</p>' :
          historico.map(h => `
            <div style="padding:14px 0;border-bottom:1px solid var(--linha)">
              <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px">
                <strong>${esc(h.turma)}</strong>
                <span style="font-family:var(--fonte-num);font-size:1.2rem;font-weight:700;color:${corFreq(h.pct)}">
                  ${h.pct !== null ? h.pct + "%" : "—"}
                </span>
              </div>
              ${barraFreq(h.pct)}
              <div style="display:flex;gap:18px;margin-top:8px">
                <span class="dica"><strong style="color:var(--verde)">${h.presentes}</strong> presenças</span>
                <span class="dica"><strong style="color:var(--alerta)">${h.faltas}</strong> faltas</span>
                <span class="dica">${h.total} aulas registradas</span>
              </div>
              ${h.alertaBaixa ? '<span class="tag dup" style="margin-top:6px">Frequência baixa</span>' : ""}
            </div>
          `).join("")}
      </div>

      <p class="dica" style="text-align:center">
        Sua presença é marcada pelo professor em cada aula.<br>
        Dúvidas? Procure a coordenação da EBD.
      </p>`;
  } catch (err) {
    elResultado.innerHTML = `<div class="aviso perigo">Erro ao buscar: ${esc(err.message)}</div>`;
  }
}

// Se CPF veio pela URL (QR do cartão), busca direto
if (cpfInicial) { $("#in-cpf").value = cpfInicial; buscar(cpfInicial); }

$("#form-busca").addEventListener("submit", (e) => {
  e.preventDefault();
  buscar($("#in-cpf").value.trim());
});
