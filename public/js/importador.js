// importador.js
// Motor de importação em massa 100% client-side.
// - CSV via PapaParse
// - XLSX via SheetJS (xlsx)
// Ambos carregados sob demanda por CDN dentro das funções, para não pesar o load
// inicial das telas que não importam.
// -----------------------------------------------------------------------------

import {
  norm,
  carregarIndiceDedup,
  classificarLinha,
  gravarAlunosEmLote,
  matricularExistentesEmLote,
} from "./db.js";

// Cabeçalhos aceitos no arquivo (tolerante a acento/caixa).
const MAPA_COLUNAS = {
  nome: ["nome", "aluno", "name"],
  telefone: ["telefone", "celular", "fone", "phone", "whatsapp"],
  email: ["email", "e-mail", "mail"],
  cpf: ["cpf", "documento"],
};

function achaCampo(cabecalho) {
  const chave = (cabecalho || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [campo, aliases] of Object.entries(MAPA_COLUNAS)) {
    if (aliases.includes(chave)) return campo;
  }
  return null;
}

// Converte uma matriz [ [cab...], [linha...] ] em objetos {nome,telefone,email,cpf}.
function matrizParaLinhas(matriz) {
  if (!matriz.length) return [];
  const cabecalhos = matriz[0].map(achaCampo);
  const linhas = [];
  for (let i = 1; i < matriz.length; i++) {
    const bruta = matriz[i];
    if (!bruta || bruta.every((c) => (c ?? "").toString().trim() === "")) continue;
    const obj = { nome: "", telefone: "", email: "", cpf: "" };
    cabecalhos.forEach((campo, col) => {
      if (campo) obj[campo] = (bruta[col] ?? "").toString().trim();
    });
    linhas.push(obj);
  }
  return linhas;
}

// -------- Carregadores de biblioteca sob demanda --------
async function carregarPapa() {
  if (window.Papa) return window.Papa;
  await import("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js");
  return window.Papa;
}
async function carregarXLSX() {
  if (window.XLSX) return window.XLSX;
  await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  return window.XLSX;
}

// -------- Leitura de arquivo --------
export async function lerArquivo(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".csv")) return lerCSV(file);
  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) return lerXLSX(file);
  throw new Error("Formato não suportado. Use .csv ou .xlsx.");
}

function lerCSV(file) {
  return new Promise(async (resolve, reject) => {
    const Papa = await carregarPapa();
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => resolve(matrizParaLinhas(res.data)),
      error: (err) => reject(err),
    });
  });
}

async function lerXLSX(file) {
  const XLSX = await carregarXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  return matrizParaLinhas(matriz);
}

// -------- Validação de linha (campos mínimos) --------
export function validarLinha(linha) {
  const erros = [];
  if (!norm.nome(linha.nome)) erros.push("nome vazio");
  if (linha.email && !/^\S+@\S+\.\S+$/.test(norm.email(linha.email)))
    erros.push("email inválido");
  return erros;
}

// -------- Pré-visualização: classifica cada linha --------
// Retorna [{ linha, status, match, alvo, erros }]
export async function preVisualizar(linhas) {
  const indice = await carregarIndiceDedup();
  // Também dedup DENTRO do próprio arquivo (mesma pessoa repetida no CSV).
  const vistosCpf = new Set(), vistosEmail = new Set(), vistosFone = new Set();

  return linhas.map((linha) => {
    const erros = validarLinha(linha);
    let cls = classificarLinha(linha, indice);

    if (cls.status === "novo") {
      const cpf = norm.cpf(linha.cpf), email = norm.email(linha.email), fone = norm.fone(linha.telefone);
      if (cpf && vistosCpf.has(cpf)) cls = { status: "possivel_duplicidade", match: "cpf (no arquivo)" };
      else if (email && vistosEmail.has(email)) cls = { status: "possivel_duplicidade", match: "email (no arquivo)" };
      else if (fone && vistosFone.has(fone)) cls = { status: "possivel_duplicidade", match: "telefone (no arquivo)" };
      if (cpf) vistosCpf.add(cpf);
      if (email) vistosEmail.add(email);
      if (fone) vistosFone.add(fone);
    }
    return { linha, ...cls, erros };
  });
}

// -------- Confirmação: grava no Firestore --------
// itens = saída de preVisualizar, possivelmente filtrada pelo usuário.
// Regras:
//   novo                  -> cria aluno (+ matrícula se turma escolhida)
//   ja_cadastrado         -> só cria matrícula (se turma escolhida)
//   possivel_duplicidade  -> só entra se o usuário marcou "confirmar"
export async function confirmarImportacao(itens, turmaCodigo = "") {
  const novos = [];
  const jaCadAlvos = [];

  for (const it of itens) {
    if (it.erros && it.erros.length) continue; // linhas inválidas nunca gravam
    if (it.status === "novo") novos.push(it.linha);
    else if (it.status === "ja_cadastrado" && it.alvo) jaCadAlvos.push(it.alvo);
    else if (it.status === "possivel_duplicidade" && it.confirmar) novos.push(it.linha);
  }

  const rNovos = await gravarAlunosEmLote(novos, turmaCodigo);
  const rExist = await matricularExistentesEmLote(jaCadAlvos, turmaCodigo);

  return {
    gravados: rNovos.gravados,
    matriculasNovas: rNovos.matriculas,
    matriculasExistentes: rExist.matriculas || 0,
    ignorados: itens.length - novos.length - jaCadAlvos.length,
    erros: rNovos.erros,
  };
}

// -------- Geração do arquivo MODELO (BAIXAR MODELO) --------
export function baixarModeloCSV() {
  const conteudo = "Nome,Telefone,Email,CPF\nRafael Xavier,(19) 99999-1111,rafael@exemplo.com,\n";
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-importacao-alunos.csv";
  a.click();
  URL.revokeObjectURL(url);
}
