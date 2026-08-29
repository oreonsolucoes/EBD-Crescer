// app-avaliacao.js — Responder avaliação (avaliacao.html?id=XXX)
// O aluno informa o CPF, busca o código e responde de forma anônima.
// O link de resposta é compartilhado pelo professor no WhatsApp/grupo da turma.
import {
  getDoc, doc, collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { alunoPorCpf, perguntasDaAvaliacao, responderAvaliacao } from "./db.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const avaliacaoId = params.get("id") || "";
function esc(s){return (s??"").toString().replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

let alunoCodigo = "";
let perguntas = [];

async function iniciar() {
  if (!avaliacaoId) { erro("Link de avaliação inválido."); return; }
  const snap = await getDoc(doc(db, "avaliacoes", avaliacaoId));
  if (!snap.exists()) { erro("Avaliação não encontrada."); return; }
  const aval = snap.data();
  if (aval.status !== "aberta") { erro("Esta avaliação já foi encerrada."); return; }
  $("#titulo-aval").textContent = aval.titulo;
  $("#passo-cpf").hidden = false;
}

$("#form-cpf").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpaErro();
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const aluno = await alunoPorCpf($("#in-cpf").value);
  btn.disabled = false;
  if (!aluno) { erro("CPF não encontrado. Confirme com o professor."); return; }
  alunoCodigo = aluno.codigo;
  perguntas = await perguntasDaAvaliacao(avaliacaoId);
  renderFormulario(perguntas);
  $("#passo-cpf").hidden = true;
  $("#passo-form").hidden = false;
});

function renderFormulario(pergs) {
  const container = $("#perguntas");
  container.innerHTML = pergs.map((p, i) => {
    if (p.tipo === "likert") {
      return `<div class="pergunta" data-id="${esc(p.perguntaId)}" data-tipo="likert">
        <p style="font-weight:600">${i+1}. ${esc(p.texto)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[1,2,3,4,5].map(v=>`<label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="p_${esc(p.perguntaId)}" value="${v}" required>
            <span class="tag jacad" style="min-width:32px;text-align:center">${v}</span>
          </label>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span class="dica">Discordo totalmente</span><span class="dica">Concordo totalmente</span>
        </div>
      </div>`;
    }
    if (p.tipo === "nps") {
      return `<div class="pergunta" data-id="${esc(p.perguntaId)}" data-tipo="nps">
        <p style="font-weight:600">${i+1}. ${esc(p.texto)}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${Array.from({length:11},(_,v)=>`<label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">
            <input type="radio" name="p_${esc(p.perguntaId)}" value="${v}" required>
            <span class="tag ${v<=6?"dup":v<=8?"jacad":"novo"}" style="min-width:30px;text-align:center">${v}</span>
          </label>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span class="dica">Jamais recomendaria</span><span class="dica">Recomendaria com certeza</span>
        </div>
      </div>`;
    }
    if (p.tipo === "dissertativa") {
      return `<div class="pergunta" data-id="${esc(p.perguntaId)}" data-tipo="dissertativa">
        <p style="font-weight:600">${i+1}. ${esc(p.texto)}</p>
        <textarea name="p_${esc(p.perguntaId)}" rows="3" style="width:100%;padding:10px;border:1px solid var(--linha);border-radius:8px;font:inherit;resize:vertical" placeholder="Sua resposta (opcional)"></textarea>
      </div>`;
    }
    return "";
  }).join('<hr style="border:0;border-top:1px solid var(--linha);margin:16px 0">');
}

$("#form-aval").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpaErro();
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  const respostas = perguntas.map(p => {
    const val = p.tipo === "dissertativa"
      ? e.target.querySelector(`textarea[name="p_${p.perguntaId}"]`)?.value?.trim()
      : e.target.querySelector(`input[name="p_${p.perguntaId}"]:checked`)?.value;
    return val ? { perguntaId: p.perguntaId, tipo: p.tipo, valor: val } : null;
  }).filter(Boolean);

  const r = await responderAvaliacao(avaliacaoId, respostas, alunoCodigo);
  if (!r.ok) {
    if (r.motivo === "ja_respondeu") erro("Você já respondeu esta avaliação.");
    else erro("Erro ao enviar. Tente novamente.");
    btn.disabled = false;
    return;
  }
  $("#passo-form").hidden = true;
  $("#passo-ok").hidden = false;
});

function erro(msg) { document.getElementById("erro").innerHTML = `<div class="aviso perigo">${msg}</div>`; }
function limpaErro() { document.getElementById("erro").innerHTML = ""; }
iniciar();
