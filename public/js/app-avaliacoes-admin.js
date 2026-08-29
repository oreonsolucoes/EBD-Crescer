// app-avaliacoes-admin.js — Gestão de avaliações no painel da coordenação.
// Importado dinamicamente pelo app-admin.js quando a aba Avaliações é aberta.
import {
  criarAvaliacao, listarAvaliacoes, resultadoAvaliacao, listarTurmas,
} from "./db.js";

const $ = (s) => document.querySelector(s);
function esc(s){return (s??"").toString().replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function toast(msg, tipo="ok"){const t=document.createElement("div");t.className=`toast ${tipo}`;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3200);}

// ---- Perguntas dinâmicas ----
let perguntas = [];

function addPergunta(tipo) {
  const idx = perguntas.length;
  perguntas.push({ tipo, texto: "" });
  const labels = { likert:"Escala Likert (1-5)", nps:"NPS (0-10)", dissertativa:"Dissertativa (texto livre)" };
  const div = document.createElement("div");
  div.className = "cartao"; div.dataset.idx = idx;
  div.style.cssText = "margin-bottom:10px;padding:14px;position:relative";
  div.innerHTML = `
    <span class="tag jacad" style="margin-bottom:8px;display:inline-block">${labels[tipo]}</span>
    <input class="perg-texto" placeholder="Texto da pergunta *" value=""
           style="width:100%;padding:9px 12px;border:1px solid var(--linha);border-radius:8px;font:inherit;margin-bottom:4px" />
    <button class="btn-rm-perg" style="position:absolute;top:12px;right:12px;background:none;border:none;cursor:pointer;color:var(--tinta-2);font-size:1.1rem" title="Remover">✕</button>`;
  div.querySelector(".btn-rm-perg").addEventListener("click", () => {
    perguntas.splice(idx, 1);
    div.remove();
    recalcIdx();
  });
  div.querySelector(".perg-texto").addEventListener("input", (e) => { perguntas[+div.dataset.idx].texto = e.target.value; });
  $("#lista-perguntas").appendChild(div);
}

function recalcIdx() {
  document.querySelectorAll("#lista-perguntas [data-idx]").forEach((el, i) => { el.dataset.idx = i; });
}

["likert","nps","dissertativa"].forEach(tipo => {
  const btn = $(`#btn-add-${tipo}`);
  if (btn) btn.addEventListener("click", () => addPergunta(tipo));
});

// ---- Criar avaliação ----
$("#form-avaliacao").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = $("#av-titulo").value.trim();
  const turma  = $("#av-turma").value;
  const quorum = parseInt($("#av-quorum").value) || 5;
  const pergsValidas = perguntas.filter(p => p.texto.trim());
  if (!titulo) { toast("Informe o título.", "err"); return; }
  if (!pergsValidas.length) { toast("Adicione ao menos uma pergunta.", "err"); return; }
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  try {
    const id = await criarAvaliacao({ titulo, turmaCodigo: turma, perguntas: pergsValidas, quorumMinimo: quorum });
    const link = location.href.replace(/[^/]*$/, "") + `avaliacao.html?id=${id}`;
    toast("Avaliação criada!");
    $("#link-avaliacao").innerHTML = `
      <div class="aviso"><strong>Link para compartilhar com os alunos:</strong><br>
      <a href="${esc(link)}" target="_blank">${esc(link)}</a></div>`;
    e.target.reset();
    perguntas = [];
    $("#lista-perguntas").innerHTML = "";
    renderListaAvaliacoes();
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

// ---- Listar avaliações existentes ----
export async function renderListaAvaliacoes() {
  const el = $("#lista-avaliacoes");
  if (!el) return;
  el.innerHTML = '<p class="vazio">Carregando…</p>';
  const avals = await listarAvaliacoes().catch(() => []);
  if (!avals.length) { el.innerHTML = '<p class="vazio">Nenhuma avaliação criada.</p>'; return; }
  el.innerHTML = `<div class="tabela-wrap"><table>
    <thead><tr><th>Título</th><th>Turma</th><th>Status</th><th>Resultado</th></tr></thead>
    <tbody>${avals.map(a=>`
      <tr>
        <td>${esc(a.titulo)}</td>
        <td>${esc(a.turmaCodigo||"—")}</td>
        <td><span class="tag ${a.status==="aberta"?"ativo":"jacad"}">${esc(a.status)}</span></td>
        <td><button class="btn btn-secundario btn-resultado" data-id="${esc(a.avaliacaoId)}"
            style="padding:4px 10px;font-size:.78rem">Ver resultado</button></td>
      </tr>`).join("")}
    </tbody></table></div>`;
  document.querySelectorAll(".btn-resultado").forEach(btn => {
    btn.addEventListener("click", () => verResultado(btn.dataset.id));
  });
}

async function verResultado(id) {
  const modal = $("#modal-resultado");
  const corpo = $("#modal-corpo");
  modal.hidden = false;
  corpo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const r = await resultadoAvaliacao(id);
    if (!r.liberado) {
      corpo.innerHTML = `<div class="aviso"><strong>Resultado não disponível.</strong><br>
        São necessárias <strong>${r.quorumMinimo}</strong> respostas. Recebidas até agora: <strong>${r.respostas}</strong>.</div>`;
      return;
    }
    corpo.innerHTML = `<h2>${esc(r.titulo)}</h2>
      <p class="dica">${r.respostas} respondentes</p>
      ${r.perguntas.map((p, i) => {
        if (p.tipo === "likert" || p.tipo === "nps") {
          const cor = p.media >= 4 ? "var(--verde)" : p.media >= 3 ? "var(--ambar)" : "var(--alerta)";
          return `<div style="padding:12px 0;border-bottom:1px solid var(--linha)">
            <strong>${i+1}. ${esc(p.texto)}</strong>
            <div style="margin-top:8px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
              <span style="font-family:var(--fonte-num);font-size:1.5rem;font-weight:700;color:${cor}">${p.media ?? "—"}</span>
              <span class="dica">média · ${p.total} respostas</span>
              ${p.nps!==null?`<span class="tag ${p.nps>=50?"ativo":p.nps>=0?"jacad":"dup"}">NPS: ${p.nps}</span>`:""}
            </div></div>`;
        }
        if (p.tipo === "dissertativa") {
          return `<div style="padding:12px 0;border-bottom:1px solid var(--linha)">
            <strong>${i+1}. ${esc(p.texto)}</strong>
            ${p.textos.length ? p.textos.map(t=>`<p style="background:var(--papel);padding:8px 12px;border-radius:8px;margin:6px 0">${esc(t)}</p>`).join("") : '<p class="dica">Sem respostas dissertativas.</p>'}
          </div>`;
        }
        return "";
      }).join("")}`;
  } catch (err) { corpo.innerHTML = `<div class="aviso perigo">Erro: ${esc(err.message)}</div>`; }
}

// Fecha modal
const fechar = () => { document.getElementById("modal-resultado").hidden = true; };
document.getElementById("btn-fechar-modal")?.addEventListener("click", fechar);
document.getElementById("modal-resultado")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) fechar(); });

// Preenche select de turmas
async function preencherTurmasAval() {
  const sel = $("#av-turma");
  if (!sel) return;
  const turmas = await listarTurmas().catch(() => []);
  sel.innerHTML = '<option value="">— todas as turmas —</option>' +
    turmas.map(t => `<option value="${esc(t.codigo)}">${esc(t.codigo)} · ${esc(t.nome)}</option>`).join("");
}

preencherTurmasAval();
renderListaAvaliacoes();
