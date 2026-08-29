// app-admin.js — Lógica da tela de Coordenação (admin.html)
// Liga a interface (abas, formulários, importação) à camada db.js/importador.js.
// -----------------------------------------------------------------------------

import { CONFIG_PENDENTE } from "./firebase-config.js";
import {
  criarAluno, listarAlunos, buscarAluno, editarAluno, excluirAluno,
  criarProfessor, listarProfessores,
  criarTurma, criarTurmaComPrazo, listarTurmas, gerarProximoCodigoTurma,
  encerrarTurmasVencidas, calcularAulas,
  criarMatricula, listarMatriculas, trancarMatricula, reativarMatricula, excluirMatricula,
} from "./db.js";
import {
  lerArquivo, preVisualizar, confirmarImportacao, baixarModeloCSV,
} from "./importador.js";
import {
  protegerPagina, sair,
  listarUsuarios, listarPendentes, aprovarUsuario, revogarUsuario, vincularProfessor,
} from "./auth.js";
import { tourAdmin, resetarTour } from "./tour.js";

// Protege a página: só coordenador entra. Bloqueia o render até validar sessão.
const { perfil: perfilAdmin } = await protegerPagina(["coordenador"]);
const elOla = document.querySelector("#ola-coordenador");
if (elOla) elOla.textContent = perfilAdmin.nome || perfilAdmin.email;
const btnSair = document.querySelector("#btn-sair");
if (btnSair) btnSair.addEventListener("click", async () => { await sair(); location.href = "index.html"; });

// Tour guiado — inicia na primeira visita
setTimeout(() => tourAdmin(), 800);

// Botão "Ver tour" no cabeçalho — adicionado direto, sem DOMContentLoaded
const btnTour = document.createElement("button");
btnTour.className = "btn btn-secundario";
btnTour.style.cssText = "padding:5px 10px;font-size:.78rem;margin-left:8px";
btnTour.textContent = "❓ Tour";
btnTour.addEventListener("click", () => { resetarTour("tour-admin-v1"); tourAdmin(true); });
document.querySelector(".topo .barra")?.appendChild(btnTour);

// ---------- utilidades de UI ----------
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function toast(msg, tipo = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Se o firebase-config.js ainda está com placeholders, avisa e não quebra.
if (CONFIG_PENDENTE) {
  const av = document.createElement("div");
  av.className = "aviso perigo";
  av.innerHTML =
    "<strong>Firebase não configurado.</strong> Edite <code>js/firebase-config.js</code> " +
    "com as credenciais do seu projeto antes de salvar dados. As telas carregam, mas as " +
    "operações de banco vão falhar.";
  $(".container").prepend(av);
}

// Encerra turmas vencidas automaticamente ao abrir o painel
encerrarTurmasVencidas().then(enc => {
  if (enc.length) toast(`${enc.length} turma(s) encerrada(s) automaticamente: ${enc.join(", ")}`);
});

// ── Modal de edição de aluno ──────────────────────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
<div id="modal-editar-aluno" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);
     z-index:200;align-items:center;justify-content:center;padding:20px">
  <div style="background:var(--papel-alto);border-radius:var(--raio);padding:24px;
              max-width:500px;width:100%;box-shadow:var(--sombra);position:relative">
    <button id="modal-fechar" style="position:absolute;top:12px;right:12px;background:none;
            border:none;cursor:pointer;font-size:1.2rem;color:var(--tinta-2)">✕</button>
    <h2 id="modal-titulo" style="margin-bottom:16px">Editar aluno</h2>
    <input type="hidden" id="modal-codigo">
    <div class="grade duas">
      <div><label>Nome</label><input id="modal-nome" /></div>
      <div><label>Telefone</label><input id="modal-telefone" inputmode="tel" /></div>
      <div><label>E-mail</label><input id="modal-email" type="email" /></div>
      <div><label>CPF</label><input id="modal-cpf" inputmode="numeric" /></div>
    </div>
    <div class="acoes" style="margin-top:14px">
      <button id="modal-salvar" class="btn btn-primario">Salvar alterações</button>
      <button id="modal-cancelar" class="btn btn-secundario">Cancelar</button>
    </div>
  </div>
</div>`);

function abrirModalEditar(aluno) {
  $("#modal-codigo").value   = aluno.codigo;
  $("#modal-nome").value     = aluno.nome;
  $("#modal-telefone").value = aluno.telefone || "";
  $("#modal-email").value    = aluno.email || "";
  $("#modal-cpf").value      = aluno.cpf || "";
  $("#modal-titulo").textContent = `Editar — ${aluno.codigo}`;
  $("#modal-editar-aluno").style.display = "flex";
}
const fecharModal = () => { $("#modal-editar-aluno").style.display = "none"; };
$("#modal-fechar").addEventListener("click", fecharModal);
$("#modal-cancelar").addEventListener("click", fecharModal);
$("#modal-editar-aluno").addEventListener("click", (e) => { if (e.target === e.currentTarget) fecharModal(); });
$("#modal-salvar").addEventListener("click", async () => {
  const btn = $("#modal-salvar"); btn.disabled = true;
  try {
    await editarAluno($("#modal-codigo").value, {
      nome: $("#modal-nome").value, telefone: $("#modal-telefone").value,
      email: $("#modal-email").value, cpf: $("#modal-cpf").value,
    });
    toast("Aluno atualizado."); fecharModal(); renderAlunos();
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

// ---------- Navegação por abas ----------
$$(".aba").forEach((aba) => {
  aba.addEventListener("click", async () => {
    $$(".aba").forEach((a) => a.setAttribute("aria-selected", "false"));
    $$(".painel").forEach((p) => (p.hidden = true));
    aba.setAttribute("aria-selected", "true");
    $("#" + aba.dataset.painel).hidden = false;
    if (aba.dataset.painel === "painel-alunos") renderAlunos();
    if (aba.dataset.painel === "painel-professores") renderProfessores();
    if (aba.dataset.painel === "painel-turmas") { renderTurmas(); preencherSelectsTurma(); }
    if (aba.dataset.painel === "painel-matriculas") { renderMatriculas(); preencherSelectsMatricula(); }
    if (aba.dataset.painel === "painel-importar") preencherSelectTurmaImport();
    if (aba.dataset.painel === "painel-usuarios") renderUsuarios();
    if (aba.dataset.painel === "painel-avaliacoes") {
      // importa módulo de avaliações só quando necessário (lazy)
      const { renderListaAvaliacoes } = await import("./app-avaliacoes-admin.js");
      renderListaAvaliacoes();
    }
  });
});

// =============================================================================
// ALUNOS
// =============================================================================
$("#form-aluno").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#form-aluno button[type=submit]");
  btn.disabled = true;
  try {
    const codigo = await criarAluno({
      nome: $("#al-nome").value,
      telefone: $("#al-telefone").value,
      email: $("#al-email").value,
      cpf: $("#al-cpf").value,
    });
    toast(`Aluno cadastrado: ${codigo}`);
    e.target.reset();
    renderAlunos();
  } catch (err) {
    toast("Erro ao cadastrar: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

async function renderAlunos() {
  const alvo = $("#lista-alunos");
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const alunos = await listarAlunos();
    $("#contagem-alunos").textContent = `${alunos.length} registro(s)`;
    if (!alunos.length) { alvo.innerHTML = '<p class="vazio">Nenhum aluno cadastrado ainda.</p>'; return; }
    alvo.innerHTML = `
      <div class="tabela-wrap"><table>
        <thead><tr><th>Código</th><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Status</th><th>Cartão</th><th>Ações</th></tr></thead>
        <tbody>${alunos.map((a) => `
          <tr>
            <td class="mono">${esc(a.codigo)}</td>
            <td>${esc(a.nome)}</td>
            <td>${esc(a.telefone)}</td>
            <td>${esc(a.email)}</td>
            <td><span class="tag ativo">${esc(a.status)}</span></td>
            <td><a href="cartao.html?codigo=${esc(a.codigo)}" class="btn btn-secundario" style="padding:4px 10px;font-size:.78rem" target="_blank">Cartão</a></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-secundario btn-editar-aluno" data-codigo="${esc(a.codigo)}"
                style="padding:4px 10px;font-size:.78rem">✏️ Editar</button>
              <button class="btn btn-secundario btn-excluir-aluno" data-codigo="${esc(a.codigo)}" data-nome="${esc(a.nome)}"
                style="padding:4px 10px;font-size:.78rem;color:var(--erro);border-color:var(--erro)">🗑 Excluir</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;

    // Liga botões
    $$(".btn-editar-aluno").forEach(btn => btn.addEventListener("click", async () => {
      const a = await buscarAluno(btn.dataset.codigo);
      if (a) abrirModalEditar(a);
    }));
    $$(".btn-excluir-aluno").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm(`Excluir permanentemente ${btn.dataset.nome} (${btn.dataset.codigo})?\nIsso apaga todas as matrículas e presenças deste aluno.`)) return;
      btn.disabled = true;
      try { await excluirAluno(btn.dataset.codigo); toast("Aluno excluído."); renderAlunos(); }
      catch (err) { toast("Erro: " + err.message, "err"); btn.disabled = false; }
    }));
  } catch (err) {
    alvo.innerHTML = `<p class="vazio">Erro ao carregar: ${esc(err.message)}</p>`;
  }
}

// =============================================================================
// PROFESSORES
// =============================================================================
$("#form-professor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#form-professor button[type=submit]");
  btn.disabled = true;
  try {
    const codigo = await criarProfessor({ nome: $("#pr-nome").value, email: $("#pr-email").value });
    toast(`Professor cadastrado: ${codigo}`);
    e.target.reset();
    renderProfessores();
  } catch (err) {
    toast("Erro: " + err.message, "err");
  } finally { btn.disabled = false; }
});

async function renderProfessores() {
  const alvo = $("#lista-professores");
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const profs = await listarProfessores();
    $("#contagem-professores").textContent = `${profs.length} registro(s)`;
    if (!profs.length) { alvo.innerHTML = '<p class="vazio">Nenhum professor cadastrado.</p>'; return; }
    alvo.innerHTML = `
      <div class="tabela-wrap"><table>
        <thead><tr><th>Código</th><th>Nome</th><th>E-mail</th><th>Status</th></tr></thead>
        <tbody>${profs.map((p) => `
          <tr><td class="mono">${esc(p.codigo)}</td><td>${esc(p.nome)}</td>
          <td>${esc(p.email)}</td><td><span class="tag ativo">${esc(p.status)}</span></td></tr>`).join("")}</tbody>
      </table></div>`;
  } catch (err) { alvo.innerHTML = `<p class="vazio">Erro: ${esc(err.message)}</p>`; }
}

// =============================================================================
// TURMAS
// =============================================================================
async function preencherSelectsTurma() {
  const sel = $("#tu-professor");
  const profs = await listarProfessores().catch(() => []);
  sel.innerHTML = '<option value="">— sem professor —</option>' +
    profs.map((p) => `<option value="${esc(p.codigo)}">${esc(p.nome)} (${esc(p.codigo)})</option>`).join("");
}

// Pré-visualiza o próximo código quando o prefixo é digitado
$("#tu-prefixo")?.addEventListener("input", async (e) => {
  const p = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const preview = $("#tu-codigo-preview");
  if (!preview) return;
  if (!p) { preview.textContent = ""; return; }
  try {
    const prox = await gerarProximoCodigoTurma(p);
    preview.textContent = `Código gerado: ${prox}`;
    preview.style.color = "var(--verde)";
  } catch { preview.textContent = ""; }
});

// Preview de datas da turma
function atualizarPreviewDatas() {
  const inicio = $("#tu-data-inicio")?.value;
  const semanas = parseInt($("#tu-semanas")?.value);
  const dia = parseInt($("#tu-dia-semana")?.value);
  const preview = $("#tu-preview-datas");
  if (!preview) return;
  if (!inicio || !semanas || isNaN(dia)) { preview.textContent = ""; return; }
  try {
    const aulas = calcularAulas(inicio, semanas, dia);
    preview.textContent = `${aulas.length} aulas: ${aulas[0]} → ${aulas[aulas.length - 1]}`;
    preview.style.color = "var(--verde)";
  } catch { preview.textContent = ""; }
}
$("#tu-data-inicio")?.addEventListener("change", atualizarPreviewDatas);
$("#tu-semanas")?.addEventListener("input", atualizarPreviewDatas);
$("#tu-dia-semana")?.addEventListener("change", atualizarPreviewDatas);

$("#form-turma").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#form-turma button[type=submit]");
  btn.disabled = true;
  try {
    const prefixo = $("#tu-prefixo")?.value?.trim();
    const codManual = $("#tu-codigo")?.value?.trim();
    const dataInicio = $("#tu-data-inicio").value;
    const semanas = parseInt($("#tu-semanas").value) || 0;
    const diaSemana = parseInt($("#tu-dia-semana").value);
    if (!dataInicio) throw new Error("Informe a data de início.");
    if (!semanas || semanas < 1) throw new Error("Informe o número de semanas.");
    const r = await criarTurmaComPrazo({
      prefixo: prefixo || "",
      codigo: codManual || "",
      nome: $("#tu-nome").value,
      professorCodigo: $("#tu-professor").value,
      diaSemana,
      dataInicio,
      semanas,
      horario: $("#tu-horario").value,
    });
    toast(`Turma criada: ${r.id} · ${r.totalAulasPrevistas} aulas até ${r.dataFim}`);
    e.target.reset();
    if ($("#tu-codigo-preview")) $("#tu-codigo-preview").textContent = "";
    renderTurmas();
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

async function renderTurmas() {
  const alvo = $("#lista-turmas");
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const turmas = await listarTurmas();
    $("#contagem-turmas").textContent = `${turmas.length} registro(s)`;
    if (!turmas.length) { alvo.innerHTML = '<p class="vazio">Nenhuma turma criada.</p>'; return; }
    alvo.innerHTML = `
      <div class="tabela-wrap"><table>
        <thead><tr><th>Código</th><th>Nome</th><th>Professor</th><th>Dia/Horário</th><th>Prazo</th><th>Aulas</th><th>Status</th></tr></thead>
        <tbody>${turmas.map((t) => `
          <tr>
            <td class="mono">${esc(t.codigo)}</td>
            <td>${esc(t.nome)}</td>
            <td>${esc(t.professorCodigo) || "—"}</td>
            <td>${esc(t.horario) || "—"}</td>
            <td style="font-size:.8rem">${t.dataInicio ? `${t.dataInicio} → ${t.dataFim}` : "—"}</td>
            <td style="text-align:center">${t.totalAulasPrevistas || "—"}</td>
            <td><span class="tag ${t.status === "ativa" ? "ativo" : "jacad"}">${esc(t.status)}</span></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  } catch (err) { alvo.innerHTML = `<p class="vazio">Erro: ${esc(err.message)}</p>`; }
}

// =============================================================================
// MATRÍCULAS
// =============================================================================
async function preencherSelectsMatricula() {
  const [alunos, turmas] = await Promise.all([listarAlunos().catch(() => []), listarTurmas().catch(() => [])]);
  $("#ma-aluno").innerHTML = '<option value="">— escolha o aluno —</option>' +
    alunos.map((a) => `<option value="${esc(a.codigo)}">${esc(a.codigo)} · ${esc(a.nome)}</option>`).join("");
  $("#ma-turma").innerHTML = '<option value="">— escolha a turma —</option>' +
    turmas.map((t) => `<option value="${esc(t.codigo)}">${esc(t.codigo)} · ${esc(t.nome)}</option>`).join("");
}

$("#form-matricula").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alunoCodigo = $("#ma-aluno").value, turmaCodigo = $("#ma-turma").value;
  if (!alunoCodigo || !turmaCodigo) { toast("Escolha aluno e turma.", "err"); return; }
  const btn = $("#form-matricula button[type=submit]");
  btn.disabled = true;
  try {
    const r = await criarMatricula({ alunoCodigo, turmaCodigo });
    toast(r.criada ? "Matrícula criada." : "Aluno já estava matriculado nessa turma.");
    renderMatriculas();
  } catch (err) { toast("Erro: " + err.message, "err"); }
  finally { btn.disabled = false; }
});

async function renderMatriculas() {
  const alvo = $("#lista-matriculas");
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const [mats, alunos] = await Promise.all([listarMatriculas(), listarAlunos().catch(() => [])]);
    const nomePorCodigo = new Map(alunos.map((a) => [a.codigo, a.nome]));
    $("#contagem-matriculas").textContent = `${mats.length} registro(s)`;
    if (!mats.length) { alvo.innerHTML = '<p class="vazio">Nenhuma matrícula.</p>'; return; }
    alvo.innerHTML = `
      <div class="tabela-wrap"><table>
        <thead><tr><th>Aluno</th><th>Nome</th><th>Turma</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${mats.map((m) => `
          <tr>
            <td class="mono">${esc(m.alunoCodigo)}</td>
            <td>${esc(nomePorCodigo.get(m.alunoCodigo) || "—")}</td>
            <td class="mono">${esc(m.turmaCodigo)}</td>
            <td><span class="tag ${m.status === "ativa" ? "ativo" : "jacad"}">${esc(m.status)}</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              ${m.status === "ativa"
                ? `<button class="btn btn-secundario btn-trancar-mat"
                    data-aluno="${esc(m.alunoCodigo)}" data-turma="${esc(m.turmaCodigo)}"
                    style="padding:4px 10px;font-size:.78rem">⏸ Trancar</button>`
                : `<button class="btn btn-secundario btn-reativar-mat"
                    data-aluno="${esc(m.alunoCodigo)}" data-turma="${esc(m.turmaCodigo)}"
                    style="padding:4px 10px;font-size:.78rem;color:var(--verde);border-color:var(--verde)">▶ Reativar</button>`}
              <button class="btn btn-secundario btn-excluir-mat"
                data-aluno="${esc(m.alunoCodigo)}" data-turma="${esc(m.turmaCodigo)}"
                style="padding:4px 10px;font-size:.78rem;color:var(--erro);border-color:var(--erro)">🗑 Excluir</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;

    $$(".btn-trancar-mat").forEach(btn => btn.addEventListener("click", async () => {
      btn.disabled = true;
      try { await trancarMatricula(btn.dataset.aluno, btn.dataset.turma); toast("Matrícula trancada."); renderMatriculas(); }
      catch (err) { toast("Erro: " + err.message, "err"); btn.disabled = false; }
    }));
    $$(".btn-reativar-mat").forEach(btn => btn.addEventListener("click", async () => {
      btn.disabled = true;
      try { await reativarMatricula(btn.dataset.aluno, btn.dataset.turma); toast("Matrícula reativada."); renderMatriculas(); }
      catch (err) { toast("Erro: " + err.message, "err"); btn.disabled = false; }
    }));
    $$(".btn-excluir-mat").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm(`Excluir permanentemente matrícula de ${btn.dataset.aluno} em ${btn.dataset.turma}?\nIsso apaga as presenças nessa turma.`)) return;
      btn.disabled = true;
      try { await excluirMatricula(btn.dataset.aluno, btn.dataset.turma); toast("Matrícula excluída."); renderMatriculas(); }
      catch (err) { toast("Erro: " + err.message, "err"); btn.disabled = false; }
    }));
  } catch (err) { alvo.innerHTML = `<p class="vazio">Erro: ${esc(err.message)}</p>`; }
}

// =============================================================================
// IMPORTAÇÃO EM MASSA
// =============================================================================
let previewAtual = []; // guarda a saída de preVisualizar entre etapas

async function preencherSelectTurmaImport() {
  const sel = $("#imp-turma");
  if (!sel) return;
  const turmas = await listarTurmas().catch(() => []);
  sel.innerHTML = '<option value="">— sem matrícula automática —</option>' +
    turmas.map((t) => `<option value="${esc(t.codigo)}">${esc(t.codigo)} · ${esc(t.nome)}</option>`).join("");
}

$("#btn-modelo").addEventListener("click", baixarModeloCSV);

const dz = $("#dropzone");
const inputArquivo = $("#imp-arquivo");
dz.addEventListener("click", () => inputArquivo.click());
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("sobre"); });
dz.addEventListener("dragleave", () => dz.classList.remove("sobre"));
dz.addEventListener("drop", (e) => {
  e.preventDefault(); dz.classList.remove("sobre");
  if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]);
});
inputArquivo.addEventListener("change", () => {
  if (inputArquivo.files[0]) processarArquivo(inputArquivo.files[0]);
});

async function processarArquivo(file) {
  $("#imp-status").textContent = `Lendo "${file.name}"…`;
  // Já preenche as turmas enquanto lê o arquivo
  preencherSelectTurmaImport();
  try {
    const linhas = await lerArquivo(file);
    if (!linhas.length) { $("#imp-status").textContent = "Arquivo sem linhas de dados."; return; }
    $("#imp-status").textContent = `Analisando ${linhas.length} linha(s)…`;
    previewAtual = await preVisualizar(linhas);
    renderPreview();
  } catch (err) {
    $("#imp-status").textContent = "";
    toast("Falha na leitura: " + err.message, "err");
  }
}

function renderPreview() {
  const cont = { novo: 0, ja_cadastrado: 0, possivel_duplicidade: 0, erro: 0 };
  previewAtual.forEach((it) => {
    if (it.erros?.length) cont.erro++;
    else cont[it.status]++;
  });
  $("#imp-status").textContent = "";

  const linhasHtml = previewAtual.map((it, i) => {
    const invalida = it.erros?.length;
    let tag, rotulo;
    if (invalida) { tag = "erro"; rotulo = "Erro: " + it.erros.join(", "); }
    else if (it.status === "novo") { tag = "novo"; rotulo = "Novo"; }
    else if (it.status === "ja_cadastrado") { tag = "jacad"; rotulo = `Já cadastrado (${it.match} → ${it.alvo})`; }
    else { tag = "dup"; rotulo = `Possível duplicidade (${it.match})`; }

    const check = it.status === "possivel_duplicidade" && !invalida
      ? `<input type="checkbox" data-idx="${i}" class="chk-confirmar" title="Confirmar cadastro mesmo assim">`
      : "";

    return `<tr>
      <td>${esc(it.linha.nome)}</td>
      <td>${esc(it.linha.telefone)}</td>
      <td>${esc(it.linha.email)}</td>
      <td>${esc(it.linha.cpf)}</td>
      <td><span class="tag ${tag}">${esc(rotulo)}</span></td>
      <td style="text-align:center">${check}</td>
    </tr>`;
  }).join("");

  $("#imp-preview").innerHTML = `
    <div class="resumo">
      <div class="item"><span class="num" style="color:var(--verde)">${cont.novo}</span><span class="lbl">Novos</span></div>
      <div class="item"><span class="num" style="color:var(--indigo)">${cont.ja_cadastrado}</span><span class="lbl">Já cadastrados</span></div>
      <div class="item"><span class="num" style="color:var(--alerta)">${cont.possivel_duplicidade}</span><span class="lbl">Possível dup.</span></div>
      <div class="item"><span class="num" style="color:var(--erro)">${cont.erro}</span><span class="lbl">Com erro</span></div>
    </div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>CPF</th><th>Status</th><th>Confirmar</th></tr></thead>
      <tbody>${linhasHtml}</tbody>
    </table></div>`;

  $("#btn-confirmar-import").disabled = (cont.novo + cont.ja_cadastrado + cont.possivel_duplicidade) === 0;
  $("#bloco-confirmar").hidden = false;
}

$("#btn-confirmar-import").addEventListener("click", async () => {
  // aplica os checkboxes de "confirmar" nas linhas de possível duplicidade
  $$(".chk-confirmar").forEach((chk) => {
    previewAtual[+chk.dataset.idx].confirmar = chk.checked;
  });
  const btn = $("#btn-confirmar-import");
  btn.disabled = true;
  $("#imp-status").textContent = "Gravando no Firestore…";
  try {
    const turma = $("#imp-turma").value;
    const r = await confirmarImportacao(previewAtual, turma);
    $("#imp-resultado").innerHTML = `
      <div class="aviso"><strong>Importação concluída.</strong><br>
        Alunos gravados: <strong>${r.gravados}</strong> ·
        Matrículas novas: <strong>${r.matriculasNovas}</strong> ·
        Matrículas de já cadastrados: <strong>${r.matriculasExistentes}</strong> ·
        Ignorados: <strong>${r.ignorados}</strong>
        ${r.erros.length ? `<br><span style="color:var(--erro)">Erros: ${esc(r.erros.join("; "))}</span>` : ""}
      </div>`;
    toast(`Importação concluída: ${r.gravados} aluno(s).`);
    previewAtual = [];
    $("#imp-preview").innerHTML = "";
    $("#bloco-confirmar").hidden = true;
    inputArquivo.value = "";
  } catch (err) {
    toast("Erro na gravação: " + err.message, "err");
    btn.disabled = false;
  } finally {
    $("#imp-status").textContent = "";
  }
});

// =============================================================================
// SPRINT 2 — GESTÃO DE USUÁRIOS (aprovar / definir papel)
// =============================================================================
async function renderUsuarios() {
  const alvo = $("#lista-usuarios");
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const [usuarios, profs] = await Promise.all([listarUsuarios(), listarProfessores().catch(() => [])]);
    const pendentes = usuarios.filter((u) => !u.aprovado);
    const ativos = usuarios.filter((u) => u.aprovado);
    $("#contagem-usuarios").textContent = `${pendentes.length} pendente(s)`;

    const optsProf = '<option value="">— vincular a professor (opcional) —</option>' +
      profs.map((p) => `<option value="${esc(p.codigo)}">${esc(p.nome)} (${esc(p.codigo)})</option>`).join("");

    const linhaPendente = (u) => `
      <tr data-uid="${esc(u.uid)}">
        <td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td>
          <select class="sel-papel">
            <option value="professor">Professor</option>
            <option value="coordenador">Coordenador</option>
          </select>
        </td>
        <td><select class="sel-prof">${optsProf}</select></td>
        <td><button class="btn btn-primario btn-aprovar" style="padding:6px 12px">Aprovar</button></td>
      </tr>`;

    const linhaAtivo = (u) => `
      <tr data-uid="${esc(u.uid)}">
        <td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td><span class="tag ${u.papel === "coordenador" ? "jacad" : "novo"}">${esc(u.papel)}</span></td>
        <td>${esc(u.professorCodigo || "—")}</td>
        <td>${u.uid === perfilAdmin.uid ? '<span class="dica">você</span>' : '<button class="btn btn-secundario btn-revogar" style="padding:6px 12px">Revogar</button>'}</td>
      </tr>`;

    alvo.innerHTML = `
      <h3 style="margin-top:4px">Aguardando aprovação</h3>
      ${pendentes.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Professor</th><th></th></tr></thead>
        <tbody>${pendentes.map(linhaPendente).join("")}</tbody></table></div>`
        : '<p class="vazio">Nenhum cadastro pendente.</p>'}
      <h3 style="margin-top:20px">Usuários ativos</h3>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Professor</th><th></th></tr></thead>
        <tbody>${ativos.map(linhaAtivo).join("")}</tbody></table></div>`;

    // liga os botões
    $$(".btn-aprovar").forEach((btn) => btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const uid = tr.dataset.uid;
      const papel = tr.querySelector(".sel-papel").value;
      const profCod = tr.querySelector(".sel-prof").value;
      btn.disabled = true;
      try {
        await aprovarUsuario(uid, papel);
        if (papel === "professor" && profCod) await vincularProfessor(uid, profCod);
        toast("Usuário aprovado.");
        renderUsuarios();
      } catch (e) { toast("Erro: " + e.message, "err"); btn.disabled = false; }
    }));

    $$(".btn-revogar").forEach((btn) => btn.addEventListener("click", async () => {
      const uid = btn.closest("tr").dataset.uid;
      btn.disabled = true;
      try { await revogarUsuario(uid); toast("Acesso revogado."); renderUsuarios(); }
      catch (e) { toast("Erro: " + e.message, "err"); btn.disabled = false; }
    }));
  } catch (err) {
    alvo.innerHTML = `<p class="vazio">Erro: ${esc(err.message)}</p>`;
  }
}

// carga inicial: mostra alunos
renderAlunos();
