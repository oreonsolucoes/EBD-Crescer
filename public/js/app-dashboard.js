// app-dashboard.js — Dashboard da coordenação (dashboard.html)
// Métricas consolidadas, gráfico de frequência por turma e alertas de evasão.
import { protegerPagina, sair } from "./auth.js";
import { metricasDashboard, alertasEvasao, freqPorTurmaHistorico } from "./db.js";

const $ = (s) => document.querySelector(s);
function esc(s){return (s??"").toString().replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

const { perfil } = await protegerPagina(["coordenador", "professor"]);
$("#ola-coord").textContent = perfil.nome || perfil.email;
$("#btn-sair").addEventListener("click", async () => { await sair(); location.href = "index.html"; });

async function carregar() {
  $("#status").textContent = "Carregando…";
  try {
    const [metricas, alertas, histTurmas] = await Promise.all([
      metricasDashboard(),
      alertasEvasao(2),
      freqPorTurmaHistorico(),
    ]);
    renderMetricas(metricas);
    renderAlertas(alertas);
    renderGrafico(histTurmas);
    renderTurmas(metricas.porTurma, histTurmas);
    $("#status").textContent = "";
  } catch (err) {
    $("#status").textContent = "Erro ao carregar: " + err.message;
  }
}

function renderMetricas(m) {
  $("#met-ativos").textContent   = m.ativos;
  $("#met-inativos").textContent = m.inativos;
  $("#met-total").textContent    = m.total;
  $("#met-freq").textContent     = m.freqMedia + "%";
  $("#met-freq").style.color     = m.freqMedia >= 75 ? "var(--verde)" : m.freqMedia >= 50 ? "var(--ambar)" : "var(--alerta)";
}

function renderAlertas(alertas) {
  const el = $("#lista-alertas");
  if (!alertas.length) {
    el.innerHTML = '<p class="vazio">Nenhum aluno com faltas consecutivas. ✓</p>';
    $("#badge-alertas").hidden = true;
    return;
  }
  $("#badge-alertas").textContent = alertas.length;
  $("#badge-alertas").hidden = false;
  el.innerHTML = alertas.map(a => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:10px 0;border-bottom:1px solid var(--linha);flex-wrap:wrap;gap:6px">
      <div>
        <strong>${esc(a.aluno.nome)}</strong>
        <span class="dica mono"> ${esc(a.aluno.codigo)}</span>
        <span class="dica"> · ${esc(a.turmaCodigo)}</span>
      </div>
      <span class="tag dup">${a.faltasConsecutivas}+ faltas seguidas</span>
    </div>`).join("");
}

function renderGrafico(turmas) {
  const canvas = $("#grafico-freq");
  if (!turmas.length) { canvas.parentElement.innerHTML = '<p class="vazio">Nenhuma turma com aulas encerradas.</p>'; return; }

  const W = canvas.width = canvas.parentElement.offsetWidth || 600;
  const H = canvas.height = 220;
  const ctx = canvas.getContext("2d");
  const pad = { t: 20, r: 20, b: 50, l: 48 };
  const gW = W - pad.l - pad.r;
  const gH = H - pad.t - pad.b;
  const bW = Math.min(60, gW / turmas.length - 10);
  const cor = (pct) => pct === null ? "#ccc" : pct >= 75 ? "#2E7D5B" : pct >= 50 ? "#C6862B" : "#A32B2B";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#F5F2EC";
  ctx.fillRect(0, 0, W, H);

  // linhas de grade
  ctx.strokeStyle = "#DED8CC"; ctx.lineWidth = 1;
  [0,25,50,75,100].forEach(v => {
    const y = pad.t + gH - (v / 100) * gH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = "#566072"; ctx.font = "11px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(v + "%", pad.l - 6, y + 4);
  });

  // barras
  turmas.forEach((t, i) => {
    const x = pad.l + (i / turmas.length) * gW + (gW / turmas.length - bW) / 2;
    const pct = t.pct ?? 0;
    const h = (pct / 100) * gH;
    const y = pad.t + gH - h;
    ctx.fillStyle = cor(pct);
    ctx.beginPath(); ctx.roundRect(x, y, bW, h, [4,4,0,0]); ctx.fill();
    // valor
    ctx.fillStyle = "#1C2230"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
    if (h > 18) ctx.fillText(pct + "%", x + bW / 2, y - 4);
    // label
    ctx.fillStyle = "#566072"; ctx.font = "11px sans-serif";
    const label = t.turma.length > 10 ? t.turma.slice(0, 9) + "…" : t.turma;
    ctx.fillText(label, x + bW / 2, H - pad.b + 16);
  });
}

function renderTurmas(porTurma, histTurmas) {
  const el = $("#tabela-turmas");
  const dados = histTurmas.map(t => ({
    ...t,
    ...( porTurma[t.turmaCodigo] || {} )
  }));
  if (!dados.length) { el.innerHTML = '<p class="vazio">Nenhuma turma com aulas encerradas.</p>'; return; }
  el.innerHTML = `
    <div class="tabela-wrap"><table>
      <thead><tr><th>Turma</th><th>Aulas</th><th>Matriculados</th><th>Freq. Média</th></tr></thead>
      <tbody>${dados.map(t => `
        <tr>
          <td>${esc(t.turma)}</td>
          <td>${t.aulas}</td>
          <td>${t.matriculados ?? "—"}</td>
          <td>
            <span style="font-weight:700;font-family:var(--fonte-num);
              color:${t.pct>=75?"var(--verde)":t.pct>=50?"var(--ambar)":"var(--alerta)"}">
              ${t.pct !== null ? t.pct + "%" : "—"}
            </span>
          </td>
        </tr>`).join("")}
      </tbody>
    </table></div>`;
}

$("#btn-atualizar").addEventListener("click", carregar);
carregar();
