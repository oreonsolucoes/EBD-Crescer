// app-admin.js — Lógica da tela de Coordenação (admin.html)
// Liga a interface (abas, formulários, importação) à camada db.js/importador.js.
// -----------------------------------------------------------------------------

import { CONFIG_PENDENTE } from "./firebase-config.js";
import {
  criarAluno, listarAlunos,
  criarProfessor, listarProfessores,
  criarTurma, listarTurmas,
  criarMatricula, listarMatriculas,
  buscarAluno,
} from "./db.js";
import {
  lerArquivo, preVisualizar, confirmarImportacao, baixarModeloCSV,
} from "./importador.js";
import {
  protegerPagina, sair,
  listarUsuarios, listarPendentes, aprovarUsuario, revogarUsuario, vincularProfessor,
} from "./auth.js";

// Protege a página: só coordenador entra. Bloqueia o render até validar sessão.
const { perfil: perfilAdmin } = await protegerPagina(["coordenador"]);
const elOla = document.querySelector("#ola-coordenador");
if (elOla) elOla.textContent = perfilAdmin.nome || perfilAdmin.email;
const btnSair = document.querySelector("#btn-sair");
if (btnSair) btnSair.addEventListener("click", async () => { await sair(); location.href = "index.html"; });

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

// ---------- Navegação por abas ----------
$$(".aba").forEach((aba) => {
  aba.addEventListener("click", async () => {
    $$(".aba").forEach((a) => a.setAttribute("aria-selected", "false"));
    $$(".painel").forEach((p) => (p.hidden = true));
    aba.setAttribute("aria-selected", "true");
    const painel = $("#" + aba.dataset.painel);
    if (painel) painel.hidden = false;
    if (aba.dataset.painel === "painel-alunos") renderAlunos();
    if (aba.dataset.painel === "painel-professores") renderProfessores();
    if (aba.dataset.painel === "painel-turmas") { renderTurmas(); preencherSelectsTurma(); }
    if (aba.dataset.painel === "painel-matriculas") { renderMatriculas(); preencherSelectsMatricula(); }
    if (aba.dataset.painel === "painel-importar") preencherSelectTurmaImport();
    if (aba.dataset.painel === "painel-usuarios") renderUsuarios();
    if (aba.dataset.painel === "painel-avaliacoes") {
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
        <thead><tr><th>Código</th><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Status</th><th>Cartão</th></tr></thead>
        <tbody>${alunos.map((a) => `
          <tr>
            <td class="mono">${esc(a.codigo)}</td>
            <td>${esc(a.nome)}</td>
            <td>${esc(a.telefone)}</td>
            <td>${esc(a.email)}</td>
            <td><span class="tag ativo">${esc(a.status)}</span></td>
            <td><a href="cartao.html?codigo=${esc(a.codigo)}" class="btn btn-secundario" style="padding:4px 10px;font-size:.78rem" target="_blank">Cartão</a></td>
          </tr>`).join("")}</tbody>
      </table></div>`;
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

$("#form-turma").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#form-turma button[type=submit]");
  btn.disabled = true;
  try {
    const id = await criarTurma({
      codigo: $("#tu-codigo").value,
      nome: $("#tu-nome").value,
      professorCodigo: $("#tu-professor").value,
      dia: $("#tu-dia").value,
      horario: $("#tu-horario").value,
    });
    toast(`Turma criada: ${id}`);
    e.target.reset();
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
        <thead><tr><th>Código</th><th>Nome</th><th>Professor</th><th>Dia</th><th>Horário</th></tr></thead>
        <tbody>${turmas.map((t) => `
          <tr><td class="mono">${esc(t.codigo)}</td><td>${esc(t.nome)}</td>
          <td>${esc(t.professorCodigo) || "—"}</td><td>${esc(t.dia)}</td><td>${esc(t.horario)}</td></tr>`).join("")}</tbody>
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
        <thead><tr><th>Aluno</th><th>Nome</th><th>Turma</th><th>Status</th></tr></thead>
        <tbody>${mats.map((m) => `
          <tr><td class="mono">${esc(m.alunoCodigo)}</td>
          <td>${esc(nomePorCodigo.get(m.alunoCodigo) || "—")}</td>
          <td class="mono">${esc(m.turmaCodigo)}</td>
          <td><span class="tag ativo">${esc(m.status)}</span></td></tr>`).join("")}</tbody>
      </table></div>`;
  } catch (err) { alvo.innerHTML = `<p class="vazio">Erro: ${esc(err.message)}</p>`; }
}

// =============================================================================
// IMPORTAÇÃO EM MASSA
// =============================================================================
let previewAtual = []; // guarda a saída de preVisualizar entre etapas

async function preencherSelectTurmaImport() {
  const sel = $("#imp-turma");
  const turmas = await listarTurmas().catch(() => []);
  sel.innerHTML = '<option value="">— não matricular agora —</option>' +
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
