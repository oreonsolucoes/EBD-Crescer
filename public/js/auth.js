// auth.js — Autenticação (Firebase Auth) e controle de papéis.
// -----------------------------------------------------------------------------
// Modelo de acesso (Sprint 2):
//  - Qualquer pessoa pode se auto-cadastrar (e-mail + senha).
//  - Ao cadastrar, cria-se um documento em `usuarios/{uid}` com
//    papel:"pendente". A pessoa NÃO tem acesso a nada até ser aprovada.
//  - O Coordenador aprova e define o papel: "coordenador" | "professor".
//  - O primeiro usuário do sistema pode se tornar coordenador automaticamente
//    (bootstrap), pois não há ninguém para aprová-lo ainda.
// -----------------------------------------------------------------------------

import { app, db } from "./firebase-config.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, getDocs, collection, updateDoc, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const auth = getAuth(app);

// ---------- Cadastro ----------
export async function cadastrar({ nome, email, senha }) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
  if (nome) await updateProfile(cred.user, { displayName: nome.trim() });

  // Bootstrap: se ainda não existe nenhum usuário, este vira coordenador aprovado.
  const existentes = await getDocs(collection(db, "usuarios"));
  const primeiro = existentes.empty;

  await setDoc(doc(db, "usuarios", cred.user.uid), {
    uid: cred.user.uid,
    nome: (nome || "").trim(),
    email: email.trim().toLowerCase(),
    papel: primeiro ? "coordenador" : "pendente",
    aprovado: primeiro,
    dataCadastro: serverTimestamp(),
  });

  return { uid: cred.user.uid, primeiro };
}

// ---------- Login / Logout ----------
export async function entrar({ email, senha }) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
  return cred.user;
}
export function sair() { return signOut(auth); }

// ---------- Perfil do usuário logado ----------
export async function perfilDoUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

// Observador central de sessão. Chama `callback(user, perfil)`.
// perfil é null se não houver documento; papel:"pendente" se aguardando aprovação.
export function observarSessao(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null, null);
    const perfil = await perfilDoUsuario(user.uid);
    callback(user, perfil);
  });
}

// ---------- Guarda de página ----------
// Protege uma página exigindo papel aprovado. Se falhar, redireciona.
// papeisPermitidos: array, ex.: ["coordenador"] ou ["coordenador","professor"].
export function protegerPagina(papeisPermitidos, { redirect = "index.html" } = {}) {
  return new Promise((resolve) => {
    observarSessao((user, perfil) => {
      if (!user) { location.href = redirect; return; }
      if (!perfil || !perfil.aprovado || perfil.papel === "pendente") {
        location.href = redirect + "?estado=pendente";
        return;
      }
      if (!papeisPermitidos.includes(perfil.papel)) {
        location.href = redirect + "?estado=sem_permissao";
        return;
      }
      resolve({ user, perfil });
    });
  });
}

// ---------- Administração de usuários (coordenador) ----------
export async function listarUsuarios() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => d.data());
}
export async function listarPendentes() {
  const q = query(collection(db, "usuarios"), where("aprovado", "==", false));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}
export async function aprovarUsuario(uid, papel) {
  if (!["coordenador", "professor"].includes(papel))
    throw new Error("Papel inválido.");
  await updateDoc(doc(db, "usuarios", uid), { papel, aprovado: true });
}
export async function revogarUsuario(uid) {
  await updateDoc(doc(db, "usuarios", uid), { papel: "pendente", aprovado: false });
}

// Vincula o uid de um usuário-professor a um registro em `professores`
// (para que a chamada saiba o professorCodigo). Opcional no Sprint 2.
export async function vincularProfessor(uid, professorCodigo) {
  await updateDoc(doc(db, "professores", professorCodigo), { uid });
  await updateDoc(doc(db, "usuarios", uid), { professorCodigo });
}
