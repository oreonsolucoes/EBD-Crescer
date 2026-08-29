// app-professor.js — Painel do professor (professor.html)
// Abre a chamada do dia, mostra o QR fixo de matrícula da turma e a LISTA de
// matriculados com toggle Presente/Ausente. Quem valida a presença é o professor.
// -----------------------------------------------------------------------------
import { protegerPagina, sair } from "./auth.js";
import {
  listarTurmas, abrirChamada, encerrarChamada, sessaoAbertaDaTurma,
  ouvirPresencas, ouvirSessaoAberta, alunosDaTurma, marcarPresenca,
} from "./db.js";
import { urlPresencaTurma, desenharQR, qrDataURL } from "./scanner.js";
import { tourProfessor, resetarTour } from "./tour.js";

const $ = (s) => document.querySelector(s);
function toast(msg, tipo = "ok") {
  const t = document.createElement("div"); t.className = `toast ${tipo}`;
  t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function esc(s){return (s??"").toString().replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

let unsubPresencas = null;
let unsubSessao = null;
let turmaSelecionada = "";
let sessaoAtual = null;
let matriculados = [];
let presentesSet = new Set();

const { perfil } = await protegerPagina(["professor", "coordenador"]);
$("#ola-professor").textContent = perfil.nome || perfil.email;
$("#btn-sair").addEventListener("click", async () => { await sair(); location.href = "index.html"; });

async function carregarTurmas() {
  const todas = await listarTurmas();
  let turmas = todas;
  if (perfil.papel === "professor" && perfil.professorCodigo) {
    turmas = todas.filter((t) => t.professorCodigo === perfil.professorCodigo);
  }
  const sel = $("#sel-turma");
  if (!turmas.length) { sel.innerHTML = '<option value="">nenhuma turma disponível</option>'; return; }
  sel.innerHTML = turmas.map((t) => `<option value="${esc(t.codigo)}">${esc(t.codigo)} · ${esc(t.nome)}</option>`).join("");
  selecionarTurma(sel.value);
}

$("#sel-turma").addEventListener("change", (e) => selecionarTurma(e.target.value));

async function selecionarTurma(turmaCodigo) {
  turmaSelecionada = turmaCodigo;
  if (unsubPresencas) { unsubPresencas(); unsubPresencas = null; }
  if (unsubSessao) { unsubSessao(); unsubSessao = null; }
  presentesSet = new Set();
  if (!turmaCodigo) return;

  const url = urlPresencaTurma(turmaCodigo);
  $("#qr-url").textContent = url;
  await desenharQR($("#qr-canvas"), url, 220);

  matriculados = await alunosDaTurma(turmaCodigo);
  unsubSessao = ouvirSessaoAberta(turmaCodigo, (sessao) => atualizarEstadoSessao(sessao));
}

function atualizarEstadoSessao(sessao) {
  sessaoAtual = sessao;
  const aberta = !!sessao;
  $("#btn-abrir").hidden = aberta;
  $("#btn-encerrar").hidden = !aberta;
  $("#estado-chamada").innerHTML = aberta
    ? '<span class="tag ativo">Chamada aberta</span>'
    : '<span class="tag jacad">Chamada fechada</span>';

  if (unsubPresencas) { unsubPresencas(); unsubPresencas = null; }
  if (aberta) {
    unsubPresencas = ouvirPresencas(sessao.sessaoCodigo, (presentes) => {
      presentesSet = new Set(presentes.map((p) => p.alunoCodigo));
      renderLista();
    });
  } else {
    presentesSet = new Set();
    renderLista();
  }
}

async function recarregarMatriculados() {
  if (turmaSelecionada) { matriculados = await alunosDaTurma(turmaSelecionada); renderLista(); }
}

function renderLista() {
  const total = matriculados.length;
  const nPres = matriculados.filter((a) => presentesSet.has(a.codigo)).length;
  $("#contador").textContent = `${nPres} / ${total}`;

  const podeMarcar = !!sessaoAtual;
  if (!total) {
    $("#lista-chamada").innerHTML = '<tr><td colspan="3" class="vazio">Nenhum aluno matriculado nesta turma ainda.</td></tr>';
    return;
  }
  $("#lista-chamada").innerHTML = matriculados.map((a) => {
    const presente = presentesSet.has(a.codigo);
    return `<tr>
      <td class="mono">${esc(a.codigo)}</td>
      <td>${esc(a.nome)}</td>
      <td style="text-align:center">
        <button class="btn ${presente ? "btn-primario" : "btn-secundario"} btn-toggle"
                data-codigo="${esc(a.codigo)}" data-nome="${esc(a.nome)}"
                ${podeMarcar ? "" : "disabled title='Abra a chamada primeiro'"}
                style="padding:6px 14px;min-width:104px">
          ${presente ? "&#10003; Presente" : "Ausente"}
        </button>
      </td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!sessaoAtual) return;
      const codigo = btn.dataset.codigo, nome = btn.dataset.nome;
      const estavaPresente = presentesSet.has(codigo);
      btn.disabled = true;
      try {
        await marcarPresenca({ sessao: sessaoAtual, aluno: { codigo, nome }, presente: !estavaPresente });
        if (estavaPresente) presentesSet.delete(codigo); else presentesSet.add(codigo);
        renderLista();
      } catch (err) { toast("Erro: " + err.message, "err"); btn.disabled = false; }
    });
  });
}

$("#btn-abrir").addEventListener("click", async () => {
  if (!turmaSelecionada) return;
  const btn = $("#btn-abrir"); btn.disabled = true;
  try {
    const professorCodigo = perfil.professorCodigo || perfil.uid;
    await abrirChamada({ turmaCodigo: turmaSelecionada, professorCodigo, minutos: 180 });
    await recarregarMatriculados();
    toast("Chamada aberta!");
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

$("#btn-encerrar").addEventListener("click", async () => {
  if (!turmaSelecionada) return;
  const btn = $("#btn-encerrar"); btn.disabled = true;
  try {
    const sessao = await sessaoAbertaDaTurma(turmaSelecionada);
    if (sessao) await encerrarChamada(sessao.sessaoCodigo);
    toast("Chamada encerrada.");
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

$("#btn-atualizar").addEventListener("click", recarregarMatriculados);

$("#btn-baixar-qr").addEventListener("click", async () => {
  if (!turmaSelecionada) return;
  const dataUrl = await qrDataURL(urlPresencaTurma(turmaSelecionada), 640);
  const a = document.createElement("a");
  a.href = dataUrl; a.download = `qr-matricula-${turmaSelecionada}.png`; a.click();
});

carregarTurmas();

// Tour guiado do professor
setTimeout(() => tourProfessor(), 1200);
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.createElement("button");
  btn.className = "btn btn-secundario";
  btn.style.cssText = "padding:5px 10px;font-size:.78rem;margin-left:8px";
  btn.textContent = "Ver tour";
  btn.addEventListener("click", () => { resetarTour("tour-professor-v1"); tourProfessor(true); });
  document.querySelector(".topo .barra")?.appendChild(btn);
});
