// app-matricula.js — Página que o aluno abre ao ler o QR Code da turma.
// URL esperada: matricula.html?turma=TURMA-HEB1
// O QR é de AUTO-MATRÍCULA (funciona a qualquer hora). A presença é do professor.
// -----------------------------------------------------------------------------
import {
  consultarParaMatricula, confirmarMatriculaAluno, cadastroRapidoEMatricula,
} from "./db.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const turmaCodigo = (params.get("turma") || "").trim().toUpperCase();

const elTurma = $("#nome-turma");
const elErro = $("#erro");
const passoCpf = $("#passo-cpf");
const passoConfirmarMat = $("#passo-confirmar");
const passoCadastro = $("#passo-cadastro");
const passoPronto = $("#passo-pronto");

let alunoEncontrado = null;

function erro(msg) { elErro.innerHTML = `<div class="aviso perigo">${msg}</div>`; }
function limpaErro() { elErro.innerHTML = ""; }
function soPasso(el) {
  [passoCpf, passoConfirmarMat, passoCadastro, passoPronto].forEach((p) => (p.hidden = p !== el));
}

async function iniciar() {
  if (!turmaCodigo) { erro("QR Code inválido: turma não informada."); return; }
  // apenas exibe o nome da turma; validação real acontece na consulta por CPF
  soPasso(passoCpf);
  elTurma.textContent = turmaCodigo;
}

// Passo 1: CPF
$("#form-cpf").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpaErro();
  const btn = e.target.querySelector("button"); btn.disabled = true;
  const cpf = $("#in-cpf").value.trim();
  try {
    const r = await consultarParaMatricula({ cpf, turmaCodigo });
    if (r.turma) elTurma.textContent = r.turma.nome || turmaCodigo;

    if (r.estado === "turma_invalida") { erro("Turma não encontrada."); return; }

    if (r.estado === "ja_matriculado") {
      alunoEncontrado = r.aluno;
      mostrarPronto(r.aluno, r.turma, "Você já está matriculado nesta turma.");
      return;
    }
    if (r.estado === "pode_matricular") {
      alunoEncontrado = r.aluno;
      $("#confirmar-txt").innerHTML =
        `Olá, <strong>${r.aluno.nome}</strong>! Deseja se matricular em <strong>${r.turma.nome}</strong>?`;
      soPasso(passoConfirmarMat);
      return;
    }
    if (r.estado === "precisa_cadastro") {
      $("#cpf-oculto").value = cpf;
      $("#aviso-cadastro").innerHTML =
        `<div class="aviso">Não encontramos seu cadastro. Faça um cadastro rápido — ele vale para esta e futuras turmas.</div>`;
      soPasso(passoCadastro);
      return;
    }
  } catch (err) { erro("Erro na consulta: " + (err.message || err)); }
  finally { btn.disabled = false; }
});

// Passo 2: confirmar matrícula (aluno existente)
$("#btn-confirmar-mat").addEventListener("click", async () => {
  const btn = $("#btn-confirmar-mat"); btn.disabled = true;
  limpaErro();
  try {
    await confirmarMatriculaAluno({ alunoCodigo: alunoEncontrado.codigo, turmaCodigo });
    const r = await consultarParaMatricula({ cpf: alunoEncontrado.cpf, turmaCodigo });
    mostrarPronto(alunoEncontrado, r.turma, "Matrícula confirmada!");
  } catch (err) { erro("Erro ao matricular: " + (err.message || err)); btn.disabled = false; }
});

$("#btn-cancelar-mat").addEventListener("click", () => soPasso(passoCpf));

// Passo 3: cadastro rápido
$("#form-cadastro").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpaErro();
  const btn = e.target.querySelector("button"); btn.disabled = true;
  try {
    const r = await cadastroRapidoEMatricula({
      nome: $("#in-nome").value,
      telefone: $("#in-telefone").value,
      cpf: $("#cpf-oculto").value,
      turmaCodigo,
    });
    if (r.erro) {
      erro(r.erro === "nome" ? "Informe seu nome." : "CPF inválido.");
      btn.disabled = false; return;
    }
    const cons = await consultarParaMatricula({ cpf: r.aluno.cpf, turmaCodigo });
    mostrarPronto(r.aluno, cons.turma, r.jaExistia ? "Matrícula confirmada!" : "Cadastro e matrícula concluídos!");
  } catch (err) { erro("Erro no cadastro: " + (err.message || err)); btn.disabled = false; }
});

function mostrarPronto(aluno, turma, titulo) {
  $("#pr-titulo").textContent = titulo;
  $("#pr-nome").textContent = aluno.nome;
  $("#pr-codigo").textContent = aluno.codigo;
  $("#pr-turma").textContent = turma?.nome || turmaCodigo;
  soPasso(passoPronto);
}

iniciar();
