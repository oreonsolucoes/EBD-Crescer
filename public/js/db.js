// db.js
// Abstração de acesso ao Cloud Firestore para o Sistema EBD IBC.
// Concentra TODA a leitura/escrita do banco num só lugar, para que as telas
// (admin.html etc.) não precisem conhecer detalhes do SDK.
// -----------------------------------------------------------------------------

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  writeBatch,
  updateDoc,
  deleteDoc,
  onSnapshot,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// -----------------------------------------------------------------------------
// Utilitários de normalização (usados na deduplicação e na formatação de código)
// -----------------------------------------------------------------------------
export const norm = {
  cpf: (v) => (v || "").replace(/\D/g, ""),
  fone: (v) => {
    let f = (v || "").replace(/\D/g, "");
    // Remove prefixo internacional 55 quando resulta em número longo (>11 dígitos)
    if (f.startsWith("55") && f.length > 11) f = f.slice(2);
    return f;
  },
  email: (v) => (v || "").trim().toLowerCase(),
  nome: (v) => (v || "").trim().replace(/\s+/g, " "),
};

export function formatCodigoAluno(n) {
  return "EBD-" + String(n).padStart(4, "0");
}

// -----------------------------------------------------------------------------
// GERADOR ATÔMICO DE CÓDIGO EBD-XXXX
// Usa runTransaction sobre /configuracoes/contadores. O Firestore garante que
// a transação é serializada por documento: se dois cadastros acontecem ao mesmo
// tempo, um deles reexecuta a função e lê o valor já atualizado. Resultado:
// impossível gerar dois EBD-XXXX iguais.
// -----------------------------------------------------------------------------
const contadoresRef = () => doc(db, "configuracoes", "contadores");

export async function gerarProximoCodigoAluno() {
  const ref = contadoresRef();
  const codigo = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? snap.data().alunos || 0 : 0;
    const proximo = atual + 1;
    // merge:true para não apagar outros contadores (ex.: professores)
    tx.set(ref, { alunos: proximo }, { merge: true });
    return formatCodigoAluno(proximo);
  });
  return codigo;
}

export async function gerarProximoCodigoSequencial(chave, prefixo, largura = 4) {
  const ref = contadoresRef();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? snap.data()[chave] || 0 : 0;
    const proximo = atual + 1;
    tx.set(ref, { [chave]: proximo }, { merge: true });
    return `${prefixo}-${String(proximo).padStart(largura, "0")}`;
  });
}

// -----------------------------------------------------------------------------
// ALUNOS
// Document ID = código EBD-XXXX (chave natural, facilita URLs e QR Codes).
// -----------------------------------------------------------------------------
export async function criarAluno({ nome, telefone, email, cpf }) {
  const codigo = await gerarProximoCodigoAluno();
  const ref = doc(db, "alunos", codigo);
  await setDoc(ref, {
    codigo,
    nome: norm.nome(nome),
    telefone: telefone || "",
    email: norm.email(email),
    cpf: cpf || "",
    status: "ativo",
    dataCadastro: serverTimestamp(),
  });
  return codigo;
}

export async function listarAlunos() {
  const snap = await getDocs(query(collection(db, "alunos"), orderBy("codigo")));
  return snap.docs.map((d) => d.data());
}

export async function buscarAluno(codigo) {
  const snap = await getDoc(doc(db, "alunos", codigo));
  return snap.exists() ? snap.data() : null;
}

// -----------------------------------------------------------------------------
// PROFESSORES
// -----------------------------------------------------------------------------
export async function criarProfessor({ nome, email }) {
  const codigo = await gerarProximoCodigoSequencial("professores", "PROF");
  const ref = doc(db, "professores", codigo);
  await setDoc(ref, {
    codigo,
    uid: "", // vinculado ao Firebase Auth no Sprint 2
    nome: norm.nome(nome),
    email: norm.email(email),
    status: "ativo",
    dataCadastro: serverTimestamp(),
  });
  return codigo;
}

export async function listarProfessores() {
  const snap = await getDocs(query(collection(db, "professores"), orderBy("codigo")));
  return snap.docs.map((d) => d.data());
}

// -----------------------------------------------------------------------------
// TURMAS
// -----------------------------------------------------------------------------

// Gera o próximo código sequencial para um prefixo de turma.
// Ex.: prefixo "HEB" → busca todas as turmas HEB-XXX e retorna HEB-004 se o maior for 003.
export async function gerarProximoCodigoTurma(prefixo) {
  const p = (prefixo || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) throw new Error("Prefixo inválido.");
  const snap = await getDocs(collection(db, "turmas"));
  const re = new RegExp(`^${p}-(\\d+)$`);
  let maior = 0;
  snap.docs.forEach((d) => {
    const m = (d.id || "").match(re);
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  });
  const proximo = String(maior + 1).padStart(3, "0");
  return `${p}-${proximo}`;
}

export async function criarTurma({ codigo, prefixo, nome, professorCodigo, dia, horario }) {
  // Se vier prefixo (ex.: "HEB"), gera o código sequencial automaticamente.
  // Se vier código manual, usa ele diretamente (retrocompatível).
  let id;
  if (prefixo && !codigo) {
    id = await gerarProximoCodigoTurma(prefixo);
  } else {
    id = (codigo || "").trim().toUpperCase();
    if (!id) throw new Error("Informe o código ou o prefixo da turma.");
  }
  const ref = doc(db, "turmas", id);
  const existe = await getDoc(ref);
  if (existe.exists()) throw new Error(`Turma ${id} já existe.`);
  await setDoc(ref, {
    codigo: id,
    nome: norm.nome(nome),
    professorCodigo: professorCodigo || "",
    dia: dia || "",
    horario: horario || "",
    status: "ativa",
  });
  return id;
}

export async function listarTurmas() {
  const snap = await getDocs(query(collection(db, "turmas"), orderBy("codigo")));
  return snap.docs.map((d) => d.data());
}

// -----------------------------------------------------------------------------
// MATRÍCULAS
// Uma pessoa (um aluno) pode ter várias matrículas. ID composto evita duplicar
// a mesma matrícula (mesmo aluno + mesma turma).
// -----------------------------------------------------------------------------
export function idMatricula(alunoCodigo, turmaCodigo) {
  return `${alunoCodigo}__${turmaCodigo}`;
}

export async function criarMatricula({ alunoCodigo, turmaCodigo }) {
  const id = idMatricula(alunoCodigo, turmaCodigo);
  const ref = doc(db, "matriculas", id);
  const existe = await getDoc(ref);
  if (existe.exists()) return { id, criada: false };
  await setDoc(ref, {
    alunoCodigo,
    turmaCodigo,
    status: "ativa",
    dataMatricula: serverTimestamp(),
  });
  return { id, criada: true };
}

export async function listarMatriculas() {
  const snap = await getDocs(collection(db, "matriculas"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// -----------------------------------------------------------------------------
// DEDUPLICAÇÃO (usada pela pré-visualização da importação)
// Carrega os índices de alunos existentes uma vez e classifica cada linha.
// Ordem de prioridade: CPF > E-mail (=> já cadastrado) ; Telefone (=> possível).
// -----------------------------------------------------------------------------
export async function carregarIndiceDedup() {
  const alunos = await listarAlunos();
  const porCpf = new Map();
  const porEmail = new Map();
  const porFone = new Map();
  for (const a of alunos) {
    if (norm.cpf(a.cpf)) porCpf.set(norm.cpf(a.cpf), a.codigo);
    if (norm.email(a.email)) porEmail.set(norm.email(a.email), a.codigo);
    if (norm.fone(a.telefone)) porFone.set(norm.fone(a.telefone), a.codigo);
  }
  return { porCpf, porEmail, porFone };
}

export function classificarLinha(linha, indice) {
  const cpf = norm.cpf(linha.cpf);
  const email = norm.email(linha.email);
  const fone = norm.fone(linha.telefone);

  if (cpf && indice.porCpf.has(cpf))
    return { status: "ja_cadastrado", match: "cpf", alvo: indice.porCpf.get(cpf) };
  if (email && indice.porEmail.has(email))
    return { status: "ja_cadastrado", match: "email", alvo: indice.porEmail.get(email) };
  if (fone && indice.porFone.has(fone))
    return { status: "possivel_duplicidade", match: "telefone", alvo: indice.porFone.get(fone) };
  return { status: "novo" };
}

// -----------------------------------------------------------------------------
// IMPORTAÇÃO EM LOTE
// Grava alunos "novos" em batches de até 500 (limite do Firestore). Cada aluno
// precisa de um código atômico; geramos todos ANTES do batch, reservando a faixa
// numa única transação para não disparar N transações.
// -----------------------------------------------------------------------------
export async function reservarFaixaCodigos(quantidade) {
  if (quantidade <= 0) return [];
  const ref = contadoresRef();
  const inicio = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists() ? snap.data().alunos || 0 : 0;
    tx.set(ref, { alunos: atual + quantidade }, { merge: true });
    return atual + 1; // primeiro número da faixa reservada
  });
  const codigos = [];
  for (let i = 0; i < quantidade; i++) codigos.push(formatCodigoAluno(inicio + i));
  return codigos;
}

export async function gravarAlunosEmLote(linhasNovas, turmaCodigo = "") {
  const codigos = await reservarFaixaCodigos(linhasNovas.length);
  const resultado = { gravados: 0, matriculas: 0, erros: [] };

  const LIMITE = 450; // margem de segurança abaixo de 500 (aluno + matrícula)
  for (let inicio = 0; inicio < linhasNovas.length; inicio += LIMITE) {
    const fatia = linhasNovas.slice(inicio, inicio + LIMITE);
    const batch = writeBatch(db);
    fatia.forEach((linha, j) => {
      const codigo = codigos[inicio + j];
      batch.set(doc(db, "alunos", codigo), {
        codigo,
        nome: norm.nome(linha.nome),
        telefone: linha.telefone || "",
        email: norm.email(linha.email),
        cpf: linha.cpf || "",
        status: "ativo",
        dataCadastro: serverTimestamp(),
      });
      if (turmaCodigo) {
        batch.set(doc(db, "matriculas", idMatricula(codigo, turmaCodigo)), {
          alunoCodigo: codigo,
          turmaCodigo,
          status: "ativa",
          dataMatricula: serverTimestamp(),
        });
      }
    });
    try {
      await batch.commit();
      resultado.gravados += fatia.length;
      if (turmaCodigo) resultado.matriculas += fatia.length;
    } catch (e) {
      resultado.erros.push(`Lote ${inicio}-${inicio + fatia.length}: ${e.message}`);
    }
  }
  return resultado;
}

// Para alunos "já cadastrados": não recria, apenas garante a matrícula na turma.
export async function matricularExistentesEmLote(alvosCodigos, turmaCodigo) {
  if (!turmaCodigo) return { matriculas: 0 };
  let matriculas = 0;
  const LIMITE = 450;
  for (let inicio = 0; inicio < alvosCodigos.length; inicio += LIMITE) {
    const fatia = alvosCodigos.slice(inicio, inicio + LIMITE);
    const batch = writeBatch(db);
    fatia.forEach((codigo) => {
      batch.set(doc(db, "matriculas", idMatricula(codigo, turmaCodigo)), {
        alunoCodigo: codigo,
        turmaCodigo,
        status: "ativa",
        dataMatricula: serverTimestamp(),
      });
    });
    await batch.commit();
    matriculas += fatia.length;
  }
  return { matriculas };
}

// =============================================================================
// SPRINT 3 — CHAMADAS (SESSÕES DE AULA)
// O QR Code é fixo por turma. O professor "abre a chamada", criando uma sessão
// com validade. O QR aponta para a turma; a página de presença resolve qual
// sessão está aberta naquela turma no momento.
// =============================================================================

// Cria uma sessão de chamada para a turma, válida por `minutos`.
export async function abrirChamada({ turmaCodigo, professorCodigo, minutos = 90 }) {
  // Impede duas sessões abertas simultâneas na mesma turma.
  const jaAberta = await sessaoAbertaDaTurma(turmaCodigo);
  if (jaAberta) return { sessaoCodigo: jaAberta.sessaoCodigo, reaberta: true };

  const agora = Date.now();
  const ref = doc(collection(db, "chamadas"));
  const codigoChamada = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  const dados = {
    sessaoCodigo: ref.id,
    turmaCodigo,
    professorCodigo: professorCodigo || "",
    codigoChamada,
    inicio: Timestamp.fromMillis(agora),
    fim: Timestamp.fromMillis(agora + minutos * 60000),
    status: "aberta",
  };
  await setDoc(ref, dados);
  return { sessaoCodigo: ref.id, reaberta: false, codigoChamada };
}

export async function encerrarChamada(sessaoCodigo) {
  await updateDoc(doc(db, "chamadas", sessaoCodigo), {
    status: "encerrada",
    fim: serverTimestamp(),
  });
}

// Retorna a sessão aberta e ainda válida (dentro do horário) de uma turma, ou null.
export async function sessaoAbertaDaTurma(turmaCodigo) {
  const q = query(
    collection(db, "chamadas"),
    where("turmaCodigo", "==", turmaCodigo),
    where("status", "==", "aberta")
  );
  const snap = await getDocs(q);
  const agora = Date.now();
  for (const d of snap.docs) {
    const c = d.data();
    const fimMs = c.fim?.toMillis ? c.fim.toMillis() : 0;
    if (agora < fimMs) return c;
  }
  return null;
}

export async function buscarSessao(sessaoCodigo) {
  const snap = await getDoc(doc(db, "chamadas", sessaoCodigo));
  return snap.exists() ? snap.data() : null;
}

// Escuta em tempo real as presenças de uma sessão (para o painel do professor).
// Retorna a função de unsubscribe.
export function ouvirPresencas(sessaoCodigo, callback) {
  const q = query(
    collection(db, "presencas"),
    where("sessaoCodigo", "==", sessaoCodigo)
  );
  return onSnapshot(q, (snap) => {
    const lista = snap.docs.map((d) => d.data());
    lista.sort((a, b) => {
      const ta = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const tb = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return ta - tb;
    });
    callback(lista);
  });
}

// Escuta em tempo real a sessão aberta de uma turma (para o professor ver estado).
export function ouvirSessaoAberta(turmaCodigo, callback) {
  const q = query(
    collection(db, "chamadas"),
    where("turmaCodigo", "==", turmaCodigo),
    where("status", "==", "aberta")
  );
  return onSnapshot(q, (snap) => {
    const agora = Date.now();
    const valida = snap.docs
      .map((d) => d.data())
      .find((c) => (c.fim?.toMillis ? c.fim.toMillis() : 0) > agora);
    callback(valida || null);
  });
}

// Lista alunos matriculados numa turma (para calcular presentes/faltantes).
export async function alunosDaTurma(turmaCodigo) {
  const q = query(
    collection(db, "matriculas"),
    where("turmaCodigo", "==", turmaCodigo),
    where("status", "==", "ativa")
  );
  const snap = await getDocs(q);
  const codigos = snap.docs.map((d) => d.data().alunoCodigo);
  const alunos = [];
  for (const codigo of codigos) {
    const a = await buscarAluno(codigo);
    if (a) alunos.push(a);
  }
  return alunos;
}

// =============================================================================
// SPRINT 4 (revisado) — AUTO-MATRÍCULA POR CPF + PRESENÇA VALIDADA PELO PROFESSOR
// Fluxo do aluno: lê QR da turma -> informa CPF.
//   - Se já existe: confirma matrícula na turma.
//   - Se não existe: cadastro rápido (nome, telefone, CPF) -> matrícula.
// A presença NÃO é mais marcada pelo aluno. O professor abre a chamada e marca
// Presente/Ausente na lista de matriculados.
// =============================================================================

export async function alunoPorCpf(cpf) {
  const c = norm.cpf(cpf);
  if (!c) return null;
  const alunos = await listarAlunos();
  return alunos.find((a) => norm.cpf(a.cpf) === c) || null;
}

// Consulta usada pela página de auto-matrícula (matricula.html).
// Retorna o estado do aluno em relação à turma.
export async function consultarParaMatricula({ cpf, turmaCodigo }) {
  const turmaSnap = await getDoc(doc(db, "turmas", turmaCodigo));
  if (!turmaSnap.exists()) return { estado: "turma_invalida" };
  const turma = turmaSnap.data();

  const aluno = await alunoPorCpf(cpf);
  if (!aluno) return { estado: "precisa_cadastro", turma };

  const jaMat = await matriculaAtiva(aluno.codigo, turmaCodigo);
  if (jaMat) return { estado: "ja_matriculado", aluno, turma };
  return { estado: "pode_matricular", aluno, turma };
}

export async function matriculaAtiva(alunoCodigo, turmaCodigo) {
  const snap = await getDoc(doc(db, "matriculas", idMatricula(alunoCodigo, turmaCodigo)));
  if (!snap.exists()) return null;
  const m = snap.data();
  return m.status === "ativa" ? m : null;
}

// Confirma a matrícula de um aluno JÁ existente na turma.
export async function confirmarMatriculaAluno({ alunoCodigo, turmaCodigo }) {
  return criarMatricula({ alunoCodigo, turmaCodigo });
}

// Cadastro rápido do aluno novo (CPF obrigatório aqui) + matrícula na turma.
export async function cadastroRapidoEMatricula({ nome, telefone, cpf, turmaCodigo }) {
  if (!norm.nome(nome)) return { erro: "nome" };
  if (!norm.cpf(cpf)) return { erro: "cpf" };
  const existente = await alunoPorCpf(cpf);
  if (existente) {
    // já existe: não duplica, apenas matricula
    await criarMatricula({ alunoCodigo: existente.codigo, turmaCodigo });
    return { aluno: existente, jaExistia: true };
  }
  const codigo = await criarAluno({ nome, telefone, email: "", cpf });
  await criarMatricula({ alunoCodigo: codigo, turmaCodigo });
  const aluno = await buscarAluno(codigo);
  return { aluno, jaExistia: false };
}

// ---------- Presença marcada pelo professor (toggle) ----------
// Cria/remove um documento de presença determinístico (sessão + aluno).
export async function marcarPresenca({ sessao, aluno, presente }) {
  const idPresenca = `${sessao.sessaoCodigo}__${aluno.codigo}`;
  const ref = doc(db, "presencas", idPresenca);
  if (presente) {
    await setDoc(ref, {
      sessaoCodigo: sessao.sessaoCodigo,
      alunoCodigo: aluno.codigo,
      turmaCodigo: sessao.turmaCodigo,
      nomeAluno: aluno.nome,
      timestamp: serverTimestamp(),
      metodo: "professor",
    });
  } else {
    // remove a presença (desmarcar)
    await deleteDoc(ref);
  }
}

export { serverTimestamp, Timestamp, onSnapshot };

// =============================================================================
// SPRINT 7 — ÁREA DO ALUNO: HISTÓRICO DE FREQUÊNCIA POR TURMA
// =============================================================================

export async function sessoesEncerradasDaTurma(turmaCodigo) {
  const q = query(
    collection(db, "chamadas"),
    where("turmaCodigo", "==", turmaCodigo),
    where("status", "==", "encerrada")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function presencasDoAlunoNaTurma(alunoCodigo, turmaCodigo) {
  const q = query(
    collection(db, "presencas"),
    where("alunoCodigo", "==", alunoCodigo),
    where("turmaCodigo", "==", turmaCodigo)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function historicoFrequencia(alunoCodigo, limiteAlerta = 75) {
  const q = query(
    collection(db, "matriculas"),
    where("alunoCodigo", "==", alunoCodigo),
    where("status", "==", "ativa")
  );
  const matSnap = await getDocs(q);
  const resultado = [];
  for (const m of matSnap.docs) {
    const { turmaCodigo } = m.data();
    const [turmaSnap, sessoes, presencas] = await Promise.all([
      getDoc(doc(db, "turmas", turmaCodigo)),
      sessoesEncerradasDaTurma(turmaCodigo),
      presencasDoAlunoNaTurma(alunoCodigo, turmaCodigo),
    ]);
    const turma = turmaSnap.exists() ? turmaSnap.data() : { nome: turmaCodigo };
    const total = sessoes.length;
    const presentes = presencas.length;
    const faltas = total - presentes;
    const pct = total > 0 ? Math.round((presentes / total) * 100) : null;
    resultado.push({
      turma: turma.nome,
      turmaCodigo,
      total,
      presentes,
      faltas,
      pct,
      alertaBaixa: pct !== null && pct < limiteAlerta,
    });
  }
  return resultado;
}

export async function areaDoAluno(cpf) {
  const aluno = await alunoPorCpf(cpf);
  if (!aluno) return { encontrado: false };
  const historico = await historicoFrequencia(aluno.codigo);
  return { encontrado: true, aluno, historico };
}

// =============================================================================
// SPRINTS 9-10 — DASHBOARD E ALERTAS DE EVASÃO
// =============================================================================

export async function metricasDashboard() {
  const [alunosSnap, matsSnap, sessoesSnap, presencasSnap] = await Promise.all([
    getDocs(collection(db, "alunos")),
    getDocs(query(collection(db, "matriculas"), where("status", "==", "ativa"))),
    getDocs(query(collection(db, "chamadas"), where("status", "==", "encerrada"))),
    getDocs(collection(db, "presencas")),
  ]);
  const alunos   = alunosSnap.docs.map(d => d.data());
  const mats     = matsSnap.docs.map(d => d.data());
  const sessoes  = sessoesSnap.docs.map(d => d.data());
  const presArr  = presencasSnap.docs.map(d => d.data());

  const ativos   = alunos.filter(a => a.status === "ativo").length;
  const inativos = alunos.filter(a => a.status === "inativo").length;

  // frequência média por matrícula
  const freqs = mats.map(m => {
    const total = sessoes.filter(s => s.turmaCodigo === m.turmaCodigo).length;
    const pres  = presArr.filter(p => p.alunoCodigo === m.alunoCodigo && p.turmaCodigo === m.turmaCodigo).length;
    return total > 0 ? pres / total : 0;
  });
  const freqMedia = freqs.length > 0
    ? Math.round(freqs.reduce((a, b) => a + b, 0) / freqs.length * 100)
    : 0;

  // contagem por turma
  const porTurma = {};
  for (const m of mats) {
    if (!porTurma[m.turmaCodigo]) porTurma[m.turmaCodigo] = { matriculados: 0, presencas: 0, sessoes: 0 };
    porTurma[m.turmaCodigo].matriculados++;
  }
  for (const s of sessoes) {
    if (porTurma[s.turmaCodigo]) porTurma[s.turmaCodigo].sessoes++;
  }
  for (const p of presArr) {
    if (porTurma[p.turmaCodigo]) porTurma[p.turmaCodigo].presencas++;
  }

  return { ativos, inativos, total: alunos.length, freqMedia, porTurma };
}

// Retorna alunos com N ou mais faltas consecutivas nas últimas aulas.
export async function alertasEvasao(nFaltasConsecutivas = 2) {
  const [matsSnap, sessoesSnap, presencasSnap, alunosSnap] = await Promise.all([
    getDocs(query(collection(db, "matriculas"), where("status", "==", "ativa"))),
    getDocs(query(collection(db, "chamadas"), where("status", "==", "encerrada"))),
    getDocs(collection(db, "presencas")),
    getDocs(collection(db, "alunos")),
  ]);
  const mats    = matsSnap.docs.map(d => d.data());
  const sessoes = sessoesSnap.docs.map(d => d.data());
  const presArr = presencasSnap.docs.map(d => d.data());
  const alunos  = alunosSnap.docs.map(d => d.data());

  // agrupa sessões por turma, ordenadas por ID (proxy de cronologia)
  const sessPorTurma = {};
  for (const s of sessoes) {
    if (!sessPorTurma[s.turmaCodigo]) sessPorTurma[s.turmaCodigo] = [];
    sessPorTurma[s.turmaCodigo].push(s);
  }
  for (const arr of Object.values(sessPorTurma))
    arr.sort((a, b) => {
      const ta = a.inicio?.toMillis ? a.inicio.toMillis() : 0;
      const tb = b.inicio?.toMillis ? b.inicio.toMillis() : 0;
      return ta - tb;
    });

  const alertas = [];
  for (const m of mats) {
    const ultimas = (sessPorTurma[m.turmaCodigo] || []).slice(-nFaltasConsecutivas);
    if (ultimas.length < nFaltasConsecutivas) continue;
    const presAluno = new Set(
      presArr.filter(p => p.alunoCodigo === m.alunoCodigo && p.turmaCodigo === m.turmaCodigo)
             .map(p => p.sessaoCodigo)
    );
    if (ultimas.every(s => !presAluno.has(s.sessaoCodigo))) {
      const aluno = alunos.find(a => a.codigo === m.alunoCodigo);
      if (aluno) alertas.push({ aluno, turmaCodigo: m.turmaCodigo, faltasConsecutivas: nFaltasConsecutivas });
    }
  }
  return alertas;
}

// Histórico de frequência por turma (para gráfico do dashboard).
export async function freqPorTurmaHistorico() {
  const [turmasSnap, sessoesSnap, presencasSnap, matsSnap] = await Promise.all([
    getDocs(collection(db, "turmas")),
    getDocs(query(collection(db, "chamadas"), where("status", "==", "encerrada"))),
    getDocs(collection(db, "presencas")),
    getDocs(query(collection(db, "matriculas"), where("status", "==", "ativa"))),
  ]);
  const turmas  = turmasSnap.docs.map(d => d.data());
  const sessoes = sessoesSnap.docs.map(d => d.data());
  const presArr = presencasSnap.docs.map(d => d.data());
  const mats    = matsSnap.docs.map(d => d.data());

  return turmas.map(t => {
    const sessDaTurma = sessoes.filter(s => s.turmaCodigo === t.codigo);
    const matsDaTurma = mats.filter(m => m.turmaCodigo === t.codigo);
    const totalEsperado = sessDaTurma.length * matsDaTurma.length;
    const totalPresencas = presArr.filter(p => p.turmaCodigo === t.codigo).length;
    const pct = totalEsperado > 0 ? Math.round(totalPresencas / totalEsperado * 100) : null;
    return { turma: t.nome, turmaCodigo: t.codigo, pct, aulas: sessDaTurma.length, matriculados: matsDaTurma.length };
  }).filter(t => t.aulas > 0);
}

// =============================================================================
// SPRINT 11 — AVALIAÇÕES PEDAGÓGICAS ANÔNIMAS
// =============================================================================

// Cria uma avaliação (coordenação define perguntas e turma-alvo).
export async function criarAvaliacao({ titulo, turmaCodigo, perguntas, quorumMinimo = 5 }) {
  const ref = doc(collection(db, "avaliacoes"));
  await setDoc(ref, {
    avaliacaoId: ref.id,
    titulo,
    turmaCodigo,
    quorumMinimo,
    status: "aberta",
    dataCriacao: serverTimestamp(),
  });
  // grava cada pergunta como subdocumento
  const batch = writeBatch(db);
  perguntas.forEach((p, i) => {
    const pRef = doc(collection(db, "avaliacoes", ref.id, "perguntas"));
    batch.set(pRef, { perguntaId: pRef.id, ordem: i, ...p });
  });
  await batch.commit();
  return ref.id;
}

export async function listarAvaliacoes(turmaCodigo) {
  const q = turmaCodigo
    ? query(collection(db, "avaliacoes"), where("turmaCodigo", "==", turmaCodigo))
    : getDocs(collection(db, "avaliacoes"));
  const snap = await (turmaCodigo ? getDocs(q) : q);
  return snap.docs.map(d => d.data());
}

export async function perguntasDaAvaliacao(avaliacaoId) {
  const snap = await getDocs(
    query(collection(db, "avaliacoes", avaliacaoId, "perguntas"), orderBy("ordem"))
  );
  return snap.docs.map(d => d.data());
}

// Grava respostas de forma anônima: o id da resposta é um hash aleatório,
// desvinculado do aluno. Garante 1 resposta por aluno por avaliação via
// um documento "sentinela" que apenas confirma participação (sem o conteúdo).
export async function responderAvaliacao(avaliacaoId, respostas, alunoCodigo) {
  // sentinela: confirma que este aluno já respondeu (sem gravar as respostas nele)
  const sentinelaRef = doc(db, "avaliacoes", avaliacaoId, "participantes", alunoCodigo);
  const jaRespondeu = await getDoc(sentinelaRef);
  if (jaRespondeu.exists()) return { ok: false, motivo: "ja_respondeu" };

  const batch = writeBatch(db);
  // grava sentinela (apenas o fato de ter participado)
  batch.set(sentinelaRef, { alunoCodigo, respondidoEm: serverTimestamp() });
  // grava respostas com id aleatório (sem referência ao aluno)
  for (const r of respostas) {
    const rRef = doc(collection(db, "avaliacoes", avaliacaoId, "respostas"));
    batch.set(rRef, { ...r, timestamp: serverTimestamp() });
  }
  await batch.commit();
  return { ok: true };
}

// Compila o resultado da avaliação (só libera se quórum atingido).
export async function resultadoAvaliacao(avaliacaoId) {
  const avalSnap = await getDoc(doc(db, "avaliacoes", avaliacaoId));
  if (!avalSnap.exists()) return null;
  const aval = avalSnap.data();

  const [respostasSnap, partsSnap] = await Promise.all([
    getDocs(collection(db, "avaliacoes", avaliacaoId, "respostas")),
    getDocs(collection(db, "avaliacoes", avaliacaoId, "participantes")),
  ]);
  const nRespostas = partsSnap.size;
  if (nRespostas < aval.quorumMinimo) {
    return { liberado: false, respostas: nRespostas, quorumMinimo: aval.quorumMinimo };
  }

  const perguntas = await perguntasDaAvaliacao(avaliacaoId);
  const todasRespostas = respostasSnap.docs.map(d => d.data());

  const compilado = perguntas.map(p => {
    const rs = todasRespostas.filter(r => r.perguntaId === p.perguntaId);
    if (p.tipo === "likert" || p.tipo === "nps") {
      const notas = rs.map(r => Number(r.valor)).filter(n => !isNaN(n));
      const media = notas.length > 0 ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length * 10) / 10 : null;
      const nps = p.tipo === "nps" && notas.length > 0
        ? Math.round(((notas.filter(n => n >= 9).length - notas.filter(n => n <= 6).length) / notas.length) * 100)
        : null;
      return { ...p, media, nps, total: notas.length };
    }
    if (p.tipo === "dissertativa") {
      // retorna textos sem identificador de aluno
      return { ...p, textos: rs.map(r => r.valor).filter(Boolean), total: rs.length };
    }
    return { ...p, total: rs.length };
  });

  return { liberado: true, titulo: aval.titulo, respostas: nRespostas, perguntas: compilado };
}

// =============================================================================
// TURMAS COM PRAZO + EDIÇÃO/EXCLUSÃO DE ALUNOS E MATRÍCULAS
// =============================================================================

// Calcula as datas de todas as aulas de uma turma.
// diaSemana: 0=domingo, 1=segunda ... 6=sábado
export function calcularAulas(dataInicio, semanas, diaSemana) {
  const inicio = new Date(dataInicio + "T12:00:00");
  const diff = (diaSemana - inicio.getDay() + 7) % 7;
  const primeira = new Date(inicio);
  primeira.setDate(primeira.getDate() + diff);
  const aulas = [];
  for (let i = 0; i < semanas; i++) {
    const d = new Date(primeira);
    d.setDate(d.getDate() + i * 7);
    aulas.push(d.toISOString().slice(0, 10));
  }
  return aulas;
}

// Cria turma com prazo definido por data de início + nº de semanas + dia da semana.
export async function criarTurmaComPrazo({
  codigo, prefixo, nome, professorCodigo, diaSemana, dataInicio, semanas, horario
}) {
  let id;
  if (prefixo && !codigo) {
    id = await gerarProximoCodigoTurma(prefixo);
  } else {
    id = (codigo || "").trim().toUpperCase();
    if (!id) throw new Error("Informe o código ou o prefixo da turma.");
  }
  const ref = doc(db, "turmas", id);
  const existe = await getDoc(ref);
  if (existe.exists()) throw new Error(`Turma ${id} já existe.`);

  const aulas = calcularAulas(dataInicio, Number(semanas), Number(diaSemana));
  const dataFim = aulas[aulas.length - 1];

  await setDoc(ref, {
    codigo: id,
    nome: norm.nome(nome),
    professorCodigo: professorCodigo || "",
    diaSemana: Number(diaSemana),
    dataInicio,
    dataFim,
    semanas: Number(semanas),
    horario: horario || "",
    totalAulasPrevistas: aulas.length,
    status: "ativa",
  });
  return { id, dataFim, totalAulasPrevistas: aulas.length };
}

// Verifica e encerra turmas vencidas (chama ao abrir o painel).
export async function encerrarTurmasVencidas() {
  const snap = await getDocs(query(collection(db, "turmas"), where("status", "==", "ativa")));
  const hoje = new Date().toISOString().slice(0, 10);
  const encerradas = [];
  for (const d of snap.docs) {
    const t = d.data();
    if (t.dataFim && t.dataFim < hoje) {
      await updateDoc(doc(db, "turmas", t.codigo), { status: "encerrada" });
      encerradas.push(t.codigo);
    }
  }
  return encerradas;
}

// Editar turma
export async function editarTurma(codigo, dados) {
  const ref = doc(db, "turmas", codigo);
  await updateDoc(ref, {
    nome: dados.nome ? norm.nome(dados.nome) : undefined,
    professorCodigo: dados.professorCodigo ?? undefined,
    horario: dados.horario ?? undefined,
    status: dados.status ?? undefined,
  });
}

// ── EDIÇÃO DE ALUNOS ──────────────────────────────────────────────────────────

export async function editarAluno(codigo, dados) {
  await updateDoc(doc(db, "alunos", codigo), {
    nome:      dados.nome      ? norm.nome(dados.nome)      : undefined,
    telefone:  dados.telefone  !== undefined ? dados.telefone  : undefined,
    email:     dados.email     !== undefined ? norm.email(dados.email) : undefined,
    cpf:       dados.cpf       !== undefined ? dados.cpf       : undefined,
  });
}

// Exclui aluno permanentemente: remove aluno + matrículas + presenças
export async function excluirAluno(codigo) {
  const batch = writeBatch(db);

  // Remove matrículas
  const mats = await getDocs(query(collection(db, "matriculas"), where("alunoCodigo", "==", codigo)));
  mats.docs.forEach((d) => batch.delete(d.ref));

  // Remove presenças
  const pres = await getDocs(query(collection(db, "presencas"), where("alunoCodigo", "==", codigo)));
  pres.docs.forEach((d) => batch.delete(d.ref));

  // Remove o aluno
  batch.delete(doc(db, "alunos", codigo));

  await batch.commit();
}

// ── EDIÇÃO DE MATRÍCULAS ──────────────────────────────────────────────────────

// Tranca matrícula (mantém histórico de presença)
export async function trancarMatricula(alunoCodigo, turmaCodigo) {
  await updateDoc(doc(db, "matriculas", idMatricula(alunoCodigo, turmaCodigo)), {
    status: "trancada",
    dataTrancamento: serverTimestamp(),
  });
}

// Reativa matrícula trancada
export async function reativarMatricula(alunoCodigo, turmaCodigo) {
  await updateDoc(doc(db, "matriculas", idMatricula(alunoCodigo, turmaCodigo)), {
    status: "ativa",
    dataTrancamento: null,
  });
}

// Exclui matrícula permanentemente + todas as presenças do aluno nessa turma
export async function excluirMatricula(alunoCodigo, turmaCodigo) {
  const batch = writeBatch(db);

  // Remove presenças do aluno nessa turma
  const pres = await getDocs(query(
    collection(db, "presencas"),
    where("alunoCodigo", "==", alunoCodigo),
    where("turmaCodigo", "==", turmaCodigo)
  ));
  pres.docs.forEach((d) => batch.delete(d.ref));

  // Remove a matrícula
  batch.delete(doc(db, "matriculas", idMatricula(alunoCodigo, turmaCodigo)));

  await batch.commit();
}

// Lista matrículas de um aluno com dados da turma
export async function matriculasDoAluno(alunoCodigo) {
  const q = query(collection(db, "matriculas"), where("alunoCodigo", "==", alunoCodigo));
  const snap = await getDocs(q);
  const mats = snap.docs.map((d) => d.data());
  const resultado = [];
  for (const m of mats) {
    const tSnap = await getDoc(doc(db, "turmas", m.turmaCodigo));
    resultado.push({ ...m, turma: tSnap.exists() ? tSnap.data() : null });
  }
  return resultado;
}
