// app-login.js — Tela de login/cadastro (index.html)
import { cadastrar, entrar, observarSessao, perfilDoUsuario } from "./auth.js";
import { CONFIG_PENDENTE } from "./firebase-config.js";

const $ = (s) => document.querySelector(s);
function toast(msg, tipo = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${tipo}`; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3600);
}

// Mensagens de estado vindas das guardas de página
const params = new URLSearchParams(location.search);
if (params.get("estado") === "pendente")
  $("#estado-msg").innerHTML = '<div class="aviso">Seu cadastro está <strong>aguardando aprovação</strong> da coordenação.</div>';
if (params.get("estado") === "sem_permissao")
  $("#estado-msg").innerHTML = '<div class="aviso perigo">Você não tem permissão para acessar essa área.</div>';

if (CONFIG_PENDENTE) {
  $("#estado-msg").innerHTML +=
    '<div class="aviso perigo"><strong>Firebase não configurado.</strong> Edite <code>js/firebase-config.js</code> antes de usar.</div>';
}

// Alterna entre abas Login / Cadastro
document.querySelectorAll(".aba").forEach((aba) => {
  aba.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((a) => a.setAttribute("aria-selected", "false"));
    document.querySelectorAll(".painel").forEach((p) => (p.hidden = true));
    aba.setAttribute("aria-selected", "true");
    $("#" + aba.dataset.painel).hidden = false;
  });
});

// Encaminha o usuário conforme o papel
async function encaminhar(perfil) {
  if (!perfil) return;
  if (!perfil.aprovado || perfil.papel === "pendente") {
    $("#estado-msg").innerHTML = '<div class="aviso">Cadastro criado. <strong>Aguarde a aprovação</strong> da coordenação.</div>';
    return;
  }
  if (perfil.papel === "coordenador") location.href = "admin.html";
  else if (perfil.papel === "professor") location.href = "professor.html";
}

// Login
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  try {
    const user = await entrar({ email: $("#lg-email").value, senha: $("#lg-senha").value });
    const perfil = await perfilDoUsuario(user.uid);
    await encaminhar(perfil);
  } catch (err) {
    toast(traduzErro(err), "err");
  } finally { btn.disabled = false; }
});

// Cadastro
$("#form-cadastro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  try {
    const { primeiro } = await cadastrar({
      nome: $("#cd-nome").value, email: $("#cd-email").value, senha: $("#cd-senha").value,
    });
    if (primeiro) { toast("Você é o primeiro usuário: coordenador!"); location.href = "admin.html"; }
    else {
      toast("Cadastro criado. Aguarde aprovação.");
      $("#estado-msg").innerHTML = '<div class="aviso">Cadastro criado com sucesso. A coordenação precisa <strong>aprovar seu acesso</strong>.</div>';
      e.target.reset();
    }
  } catch (err) { toast(traduzErro(err), "err"); }
  finally { btn.disabled = false; }
});

function traduzErro(err) {
  const c = err.code || "";
  if (c.includes("email-already-in-use")) return "Este e-mail já está cadastrado.";
  if (c.includes("invalid-credential") || c.includes("wrong-password")) return "E-mail ou senha incorretos.";
  if (c.includes("user-not-found")) return "Usuário não encontrado.";
  if (c.includes("weak-password")) return "A senha precisa de ao menos 6 caracteres.";
  if (c.includes("invalid-email")) return "E-mail inválido.";
  return "Erro: " + (err.message || c);
}

// Se já estiver logado, encaminha direto
observarSessao((user, perfil) => { if (user && perfil) encaminhar(perfil); });
