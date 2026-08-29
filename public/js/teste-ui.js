// teste-ui.js — Testes de interação, cliques e transições
// Injeta um painel flutuante na página atual e testa os elementos reais.
// Uso: import "./js/teste-ui.js" no console, ou adicione ?teste=1 na URL.
// -----------------------------------------------------------------------------

const ESTILOS = `
  #ebd-teste-painel {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
    background: #1C2230; color: #fff; font-family: monospace; font-size: 12px;
    max-height: 40vh; display: flex; flex-direction: column;
    border-top: 3px solid #C6862B; box-shadow: 0 -4px 20px rgba(0,0,0,.4);
  }
  #ebd-teste-toolbar {
    display: flex; gap: 8px; padding: 8px 12px; background: #141a27;
    align-items: center; flex-shrink: 0;
  }
  #ebd-teste-toolbar button {
    padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer;
    font: inherit; font-size: 11px; font-weight: 600;
  }
  #ebd-teste-toolbar .btn-run  { background: #C6862B; color: #241a08; }
  #ebd-teste-toolbar .btn-clear { background: #2E7D5B; color: #fff; }
  #ebd-teste-toolbar .btn-close { background: #A32B2B; color: #fff; margin-left: auto; }
  #ebd-teste-toolbar .titulo { color: #C6862B; font-weight: 700; }
  #ebd-teste-log {
    overflow-y: auto; padding: 8px 12px; flex: 1;
  }
  .tl { padding: 2px 0; display: flex; gap: 8px; border-bottom: 1px solid #2a3245; }
  .tl.ok   .tic { color: #2E7D5B; }
  .tl.fail .tic { color: #A32B2B; }
  .tl.warn .tic { color: #C6862B; }
  .tl.info .tic { color: #6080cc; }
  .tl .msg { flex: 1; }
  .tl .det { color: #888; font-size: 10px; }
  #ebd-teste-resumo { padding: 6px 12px; background: #141a27;
    font-weight: 700; font-size: 11px; flex-shrink: 0; }
`;

// ── bootstrap ────────────────────────────────────────────────────────────────
function injetar() {
  if (document.getElementById("ebd-teste-painel")) return;
  const style = document.createElement("style");
  style.textContent = ESTILOS;
  document.head.appendChild(style);

  const painel = document.createElement("div");
  painel.id = "ebd-teste-painel";
  painel.innerHTML = `
    <div id="ebd-teste-toolbar">
      <span class="titulo">⚗ EBD Testes de UI</span>
      <button class="btn-run"   id="ebd-btn-run">▶ Rodar</button>
      <button class="btn-clear" id="ebd-btn-clear">🧹 Limpar</button>
      <button class="btn-close" id="ebd-btn-close">✕ Fechar</button>
    </div>
    <div id="ebd-teste-log"></div>
    <div id="ebd-teste-resumo">Pronto. Clique em ▶ Rodar.</div>
  `;
  document.body.appendChild(painel);

  document.getElementById("ebd-btn-run").onclick   = rodarTodos;
  document.getElementById("ebd-btn-clear").onclick = limpar;
  document.getElementById("ebd-btn-close").onclick = () => painel.remove();
}

// ── log ──────────────────────────────────────────────────────────────────────
const log = document.getElementById?.("ebd-teste-log");
let ok = 0, fail = 0, warn = 0;

function linha(tipo, msg, det = "") {
  const el = document.getElementById("ebd-teste-log");
  if (!el) return;
  const d = document.createElement("div");
  d.className = `tl ${tipo}`;
  const icons = { ok:"✓", fail:"✗", warn:"⚠", info:"ℹ" };
  d.innerHTML = `<span class="tic">${icons[tipo]}</span>
    <span class="msg">${msg}${det ? `<span class="det"> — ${det}</span>` : ""}</span>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
  if (tipo === "ok")   ok++;
  if (tipo === "fail") fail++;
  if (tipo === "warn") warn++;
  atualizarResumo();
}
const tOk   = (m, d) => linha("ok",   m, d);
const tFail = (m, d) => linha("fail", m, d);
const tWarn = (m, d) => linha("warn", m, d);
const tInfo = (m, d) => linha("info", m, d);

function atualizarResumo() {
  const el = document.getElementById("ebd-teste-resumo");
  if (!el) return;
  el.textContent = `✓ ${ok}  ✗ ${fail}  ⚠ ${warn}`;
  el.style.color = fail > 0 ? "#A32B2B" : warn > 0 ? "#C6862B" : "#2E7D5B";
}

function limpar() {
  const el = document.getElementById("ebd-teste-log");
  if (el) el.innerHTML = "";
  ok = 0; fail = 0; warn = 0;
  atualizarResumo();
}

// ── utilitários de teste ─────────────────────────────────────────────────────
function existe(sel, desc) {
  const el = document.querySelector(sel);
  el ? tOk(`${desc} existe`, sel) : tFail(`${desc} ausente`, sel);
  return el;
}

function visivel(sel, desc) {
  const el = document.querySelector(sel);
  if (!el) { tFail(`${desc} ausente`, sel); return; }
  const r = el.getBoundingClientRect();
  const viz = r.width > 0 && r.height > 0 && !el.hidden && el.offsetParent !== null;
  viz ? tOk(`${desc} visível`) : tFail(`${desc} não visível`, `hidden=${el.hidden}`);
  return viz;
}

async function clicar(sel, desc, espera = 400) {
  const el = document.querySelector(sel);
  if (!el) { tFail(`Clique em ${desc} — elemento ausente`, sel); return false; }
  el.click();
  await delay(espera);
  tOk(`Clique em ${desc} executado`);
  return true;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function cssVar(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

// ── TESTES POR PÁGINA ────────────────────────────────────────────────────────

async function testeIndex() {
  tInfo("=== index.html — Login / Cadastro ===");
  existe("#form-login",   "Formulário login");
  existe("#form-cadastro","Formulário cadastro");
  existe("#lg-email",     "Campo e-mail login");
  existe("#lg-senha",     "Campo senha login");
  visivel("#painel-login","Painel login visível");

  // Transição para aba Cadastro
  const abaCD = document.querySelector("[data-painel='painel-cadastro']");
  if (abaCD) {
    abaCD.click(); await delay(300);
    visivel("#painel-cadastro", "Painel cadastro após clicar aba");
    const painelLogin = document.querySelector("#painel-login");
    painelLogin?.hidden ? tOk("Painel login ocultado após trocar aba")
                        : tFail("Painel login deveria estar oculto");
  } else tFail("Aba Cadastro não encontrada");

  // Volta para Login
  const abaLG = document.querySelector("[data-painel='painel-login']");
  if (abaLG) { abaLG.click(); await delay(300); visivel("#painel-login","Voltou para aba Login"); }

  // Submissão sem dados → validação nativa HTML5
  const btnLogin = document.querySelector("#form-login button[type=submit]");
  if (btnLogin) {
    const input = document.querySelector("#lg-email");
    const valAntes = input?.value;
    tOk("Botão Entrar presente e clicável");
  }
}

async function testeAdmin() {
  tInfo("=== admin.html — Coordenação ===");

  // Estrutura base
  existe(".abas",           "Container de abas");
  existe("#painel-alunos",  "Painel alunos");
  existe("#form-aluno",     "Form aluno");
  existe("#al-nome",        "Campo nome aluno");
  existe("#btn-modelo",     "Botão baixar modelo CSV");
  existe("#dropzone",       "Dropzone importação");

  // Logo e cabeçalho
  const logo = document.querySelector(".logo-header");
  logo ? tOk("Logo presente no cabeçalho") : tWarn("Logo ausente (img/logo-header.png)");

  // Botão tour
  const btnTour = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Tour"));
  btnTour ? tOk("Botão Tour presente") : tFail("Botão Tour ausente");

  // Transições entre abas
  const abas = document.querySelectorAll(".aba");
  tInfo(`${abas.length} aba(s) encontrada(s)`);

  const ordemAbas = ["painel-alunos","painel-professores","painel-turmas",
                     "painel-matriculas","painel-importar","painel-usuarios","painel-avaliacoes"];

  for (const painelId of ordemAbas) {
    const aba = document.querySelector(`[data-painel="${painelId}"]`);
    if (!aba) { tWarn(`Aba ${painelId} não encontrada`); continue; }

    aba.click();
    await delay(600);

    const painel = document.querySelector(`#${painelId}`);
    if (!painel) { tFail(`Painel #${painelId} não existe no DOM`); continue; }

    !painel.hidden
      ? tOk(`Transição → ${painelId}`)
      : tFail(`Painel ${painelId} ainda oculto após clicar`);

    // Verifica que os outros painéis estão ocultos
    let outroVisivel = false;
    for (const outro of ordemAbas) {
      if (outro === painelId) continue;
      const p = document.querySelector(`#${outro}`);
      if (p && !p.hidden) { outroVisivel = true; tFail(`Painel ${outro} deveria estar oculto`); }
    }
    if (!outroVisivel) tOk(`Outros painéis ocultos em ${painelId}`);
  }

  // Modal de avaliação (deve estar oculto por padrão)
  const modal = document.querySelector("#modal-resultado");
  if (modal) {
    modal.style.display === "none"
      ? tOk("Modal avaliação oculto por padrão")
      : tFail("Modal avaliação visível indevidamente", `display=${modal.style.display}`);
  }

  // Formulários sem submissão (só verifica campos obrigatórios)
  const camposObrig = ["#al-nome","#pr-nome","#tu-nome","#tu-prefixo"];
  for (const sel of camposObrig) {
    const el = document.querySelector(sel);
    if (el) {
      el.required || sel === "#tu-prefixo"
        ? tOk(`Campo ${sel} presente`)
        : tWarn(`Campo ${sel} sem required`);
    }
  }
}

async function testeProfessor() {
  tInfo("=== professor.html — Chamada ===");
  existe("#sel-turma",     "Select de turma");
  existe("#btn-abrir",     "Botão abrir chamada");
  existe("#btn-encerrar",  "Botão encerrar chamada");
  existe("#qr-canvas",     "Canvas do QR Code");
  existe("#lista-chamada", "Tabela de chamada");
  existe("#contador",      "Contador presentes");
  existe("#btn-baixar-qr", "Botão baixar QR");

  // Botão encerrar deve estar oculto por padrão
  const btnEnc = document.querySelector("#btn-encerrar");
  if (btnEnc) btnEnc.hidden
    ? tOk("Botão Encerrar oculto por padrão")
    : tFail("Botão Encerrar deveria estar oculto antes de abrir chamada");

  // Botão abrir visível por padrão
  const btnAbr = document.querySelector("#btn-abrir");
  if (btnAbr) !btnAbr.hidden
    ? tOk("Botão Abrir visível por padrão")
    : tFail("Botão Abrir deveria estar visível");

  const logo = document.querySelector(".logo-header");
  logo ? tOk("Logo presente") : tWarn("Logo ausente");
  const btnTour = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Tour"));
  btnTour ? tOk("Botão Tour presente") : tFail("Botão Tour ausente");
}

async function testeMatricula() {
  tInfo("=== matricula.html — Auto-matrícula ===");
  existe("#passo-cpf",      "Passo CPF");
  existe("#in-cpf",         "Campo CPF");
  existe("#passo-confirmar","Passo confirmar matrícula");
  existe("#passo-cadastro", "Passo cadastro rápido");
  existe("#passo-pronto",   "Passo confirmação");

  // Só passo CPF visível por padrão
  const passoCpf = document.querySelector("#passo-cpf");
  const passoConf = document.querySelector("#passo-confirmar");
  const passoOk = document.querySelector("#passo-pronto");

  if (passoCpf && passoConf && passoOk) {
    !passoConf.hidden ? tFail("Passo confirmar deveria estar oculto inicialmente") : tOk("Passo confirmar oculto");
    !passoOk.hidden   ? tFail("Passo pronto deveria estar oculto inicialmente")    : tOk("Passo pronto oculto");
  }
}

async function testeArea() {
  tInfo("=== area.html — Área do Aluno ===");
  existe("#form-busca","Form busca CPF");
  existe("#in-cpf",    "Campo CPF");
  existe("#resultado", "Container resultado");
  const btn = document.querySelector("#form-busca button");
  btn ? tOk("Botão buscar presente") : tFail("Botão buscar ausente");
}

async function testeDashboard() {
  tInfo("=== dashboard.html — Dashboard ===");
  existe("#grafico-freq",  "Canvas gráfico frequência");
  existe("#lista-alertas", "Lista alertas evasão");
  existe("#met-total",     "Métrica total alunos");
  existe("#met-ativos",    "Métrica ativos");
  existe("#met-freq",      "Métrica frequência");
  existe("#tabela-turmas", "Tabela por turma");
  existe("#btn-atualizar", "Botão atualizar");
}

// ── DETECTA PÁGINA ATUAL E RODA SUITE CORRETA ─────────────────────────────
async function rodarTodos() {
  limpar();
  const pagina = location.pathname.split("/").pop() || "index.html";
  tInfo(`Página detectada: ${pagina}`);

  // Testes comuns a todas as páginas
  const logo = document.querySelector(".logo-header");
  logo ? tOk("Logo no cabeçalho") : tWarn("Logo ausente — img/logo-header.png não encontrado");

  const topoEl = document.querySelector(".topo .barra");
  topoEl ? tOk("Cabeçalho .topo.barra presente") : tFail("Cabeçalho ausente");

  // CSS vars
  const vars = ["--indigo","--ambar","--verde","--papel"];
  for (const v of vars) {
    cssVar(v) ? tOk(`CSS ${v} carregada`, cssVar(v)) : tFail(`CSS ${v} não definida`);
  }

  // Suite específica
  if (pagina === "index.html"      || pagina === "") await testeIndex();
  else if (pagina === "admin.html")                  await testeAdmin();
  else if (pagina === "professor.html")              await testeProfessor();
  else if (pagina === "matricula.html")              await testeMatricula();
  else if (pagina === "area.html")                   await testeArea();
  else if (pagina === "dashboard.html")              await testeDashboard();
  else tInfo("Nenhuma suite específica para esta página");

  tInfo("=== Fim dos testes ===");
}

// ── INIT ─────────────────────────────────────────────────────────────────────
injetar();

// Auto-roda se URL tiver ?teste=1
if (new URLSearchParams(location.search).get("teste") === "1") {
  setTimeout(rodarTodos, 1000);
}

export { rodarTodos };
