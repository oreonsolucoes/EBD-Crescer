// app-professor.js — Painel do professor (professor.html)
// - Sem QR Code (removido): professor só faz chamada
// - Múltiplos professores por turma (professoresCodigos[])
// - Professor só vê turmas onde está vinculado
// - Bug de presença corrigido: renderLista chama imediatamente ao abrir sessão
import { protegerPagina, sair } from "./auth.js";
import {
  listarTurmas, abrirChamada, encerrarChamada, sessaoAbertaDaTurma,
  ouvirPresencas, ouvirSessaoAberta, alunosDaTurma, marcarPresenca,
} from "./db.js";
import { urlMatriculaTurma, qrDataURL } from "./scanner.js";
import { tourProfessor, resetarTour } from "./tour.js";

const $ = (s) => document.querySelector(s);
function toast(msg, tipo = "ok") {
  const t = document.createElement("div"); t.className = `toast ${tipo}`;
  t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

let unsubPresencas = null;
let unsubSessao    = null;
let turmaSelecionada = "";
let sessaoAtual    = null;
let matriculados   = [];
let presentesSet   = new Set();

// ── Proteção de página ────────────────────────────────────────────────────────
const { perfil } = await protegerPagina(["professor", "coordenador"]);
$("#ola-professor").textContent = perfil.nome || perfil.email;
$("#btn-sair").addEventListener("click", async () => { await sair(); location.href = "index.html"; });

// Botão tour
const btnTourProf = document.createElement("button");
btnTourProf.className = "btn btn-secundario";
btnTourProf.style.cssText = "padding:5px 10px;font-size:.78rem;margin-left:8px";
btnTourProf.textContent = "❓ Tour";
btnTourProf.addEventListener("click", () => { resetarTour("tour-professor-v1"); tourProfessor(true); });
document.querySelector(".topo .barra")?.appendChild(btnTourProf);

// ── Carrega turmas filtradas pelo professor ───────────────────────────────────
async function carregarTurmas() {
  const todas = await listarTurmas();
  let turmas = todas;

  if (perfil.papel === "professor") {
    // Filtra turmas onde o professor está vinculado
    // Suporta tanto professoresCodigos[] (novo) quanto professorCodigo (legado)
    turmas = todas.filter((t) => {
      const lista = Array.isArray(t.professoresCodigos) ? t.professoresCodigos : [];
      const legado = t.professorCodigo || "";
      const uid = perfil.uid || "";
      const profCod = perfil.professorCodigo || "";
      return lista.includes(profCod) || lista.includes(uid) ||
             legado === profCod || legado === uid;
    });
  }

  const sel = $("#sel-turma");
  if (!turmas.length) {
    sel.innerHTML = '<option value="">Nenhuma turma vinculada</option>';
    toast("Você não está vinculado a nenhuma turma. Peça à coordenação para vincular.", "err");
    return;
  }
  sel.innerHTML = turmas.map((t) =>
    `<option value="${esc(t.codigo)}">${esc(t.codigo)} · ${esc(t.nome)}</option>`
  ).join("");
  selecionarTurma(sel.value);
}

$("#sel-turma").addEventListener("change", (e) => selecionarTurma(e.target.value));

async function selecionarTurma(turmaCodigo) {
  turmaSelecionada = turmaCodigo;
  if (unsubPresencas) { unsubPresencas(); unsubPresencas = null; }
  if (unsubSessao)    { unsubSessao();    unsubSessao    = null; }
  sessaoAtual   = null;
  presentesSet  = new Set();
  matriculados  = [];
  renderLista();
  if (!turmaCodigo) return;

  matriculados = await alunosDaTurma(turmaCodigo);
  unsubSessao  = ouvirSessaoAberta(turmaCodigo, atualizarEstadoSessao);
}

// ── Estado da sessão ──────────────────────────────────────────────────────────
function atualizarEstadoSessao(sessao) {
  sessaoAtual = sessao;
  const aberta = !!sessao;
  $("#btn-abrir").hidden    = aberta;
  $("#btn-encerrar").hidden = !aberta;
  $("#estado-chamada").innerHTML = aberta
    ? '<span class="tag ativo">Chamada aberta</span>'
    : '<span class="tag jacad">Chamada fechada</span>';

  if (unsubPresencas) { unsubPresencas(); unsubPresencas = null; }

  if (aberta) {
    // Renderiza IMEDIATAMENTE com botões habilitados — não espera presenças
    renderLista();
    // Depois atualiza em tempo real quando presenças chegarem
    unsubPresencas = ouvirPresencas(sessao.sessaoCodigo, (presentes) => {
      presentesSet = new Set(presentes.map((p) => p.alunoCodigo));
      renderLista();
    });
  } else {
    presentesSet = new Set();
    renderLista();
  }
}

// ── Renderiza lista de presença ───────────────────────────────────────────────
function renderLista() {
  const total = matriculados.length;
  const nPres = [...presentesSet].filter(c => matriculados.some(a => a.codigo === c)).length;
  $("#contador").textContent = `${nPres} / ${total}`;

  const podeMarcar = !!sessaoAtual;

  if (!total) {
    $("#lista-chamada").innerHTML =
      '<tr><td colspan="3" class="vazio">Nenhum aluno matriculado nesta turma ainda.</td></tr>';
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
                style="padding:6px 14px;min-width:110px">
          ${presente ? "✓ Presente" : "Ausente"}
        </button>
      </td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!sessaoAtual) { toast("Abra a chamada primeiro.", "err"); return; }
      const codigo = btn.dataset.codigo;
      const nome   = btn.dataset.nome;
      const estavaPresente = presentesSet.has(codigo);
      btn.disabled = true;
      try {
        await marcarPresenca({
          sessao: sessaoAtual,
          aluno:  { codigo, nome },
          presente: !estavaPresente,
        });
        // Atualização otimista
        if (estavaPresente) presentesSet.delete(codigo);
        else presentesSet.add(codigo);
        renderLista();
      } catch (err) {
        toast("Erro ao marcar presença: " + err.message, "err");
        btn.disabled = false;
      }
    });
  });
}

async function recarregarMatriculados() {
  if (!turmaSelecionada) return;
  matriculados = await alunosDaTurma(turmaSelecionada);
  renderLista();
}

// ── Abrir / Encerrar ──────────────────────────────────────────────────────────
$("#btn-abrir").addEventListener("click", async () => {
  if (!turmaSelecionada) { toast("Selecione uma turma.", "err"); return; }
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
  if (!confirm("Encerrar a chamada? A sessão será fechada e as presenças serão salvas.")) return;
  const btn = $("#btn-encerrar"); btn.disabled = true;
  try {
    const sessao = await sessaoAbertaDaTurma(turmaSelecionada);
    if (sessao) await encerrarChamada(sessao.sessaoCodigo);
    toast("Chamada encerrada.");
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

$("#btn-atualizar").addEventListener("click", recarregarMatriculados);

// ── Download QR (mantém funcionalidade sem exibir o card) ────────────────────
$("#btn-baixar-qr").addEventListener("click", async () => {
  if (!turmaSelecionada) { toast("Selecione uma turma.", "err"); return; }
  try {
    const url     = urlMatriculaTurma(turmaSelecionada);
    const dataUrl = await qrDataURL(url, 640);
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `qr-matricula-${turmaSelecionada}.png`; a.click();
  } catch (err) { toast("Erro ao gerar QR: " + err.message, "err"); }
});

// ── Tour e inicialização ──────────────────────────────────────────────────────
setTimeout(() => tourProfessor(), 1200);
carregarTurmas();
