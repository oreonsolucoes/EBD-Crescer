// tour.js — Tours guiados com Driver.js para o Sistema EBD IBC
// Driver.js v1.x carregado via CDN sob demanda.
// Cada tour é salvo no localStorage para não repetir na próxima visita.
// -----------------------------------------------------------------------------

async function carregarDriver() {
  if (window.driver) return window.driver;
  // CSS do Driver.js
  if (!document.getElementById("driver-css")) {
    const link = document.createElement("link");
    link.id = "driver-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css";
    document.head.appendChild(link);
  }
  // JS do Driver.js
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.driver;
}

// Inicia um tour. `passos` = array de objetos do Driver.js
async function iniciarTour(chave, passos, opcoes = {}) {
  const { driver: driverFn } = await carregarDriver();
  const d = driverFn({
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.55,
    stagePadding: 8,
    stageRadius: 10,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Próximo →",
    prevBtnText: "← Anterior",
    doneBtnText: "Concluir ✓",
    onDestroyStarted: () => { localStorage.setItem(chave, "visto"); d.destroy(); },
    ...opcoes,
    steps: passos,
  });
  d.drive();
  return d;
}

function jaViu(chave) { return localStorage.getItem(chave) === "visto"; }
function marcarVisto(chave) { localStorage.setItem(chave, "visto"); }
function resetarTour(chave) { localStorage.removeItem(chave); }

// ============================================================
// TOUR DO ADMIN (coordenação)
// ============================================================
export async function tourAdmin(forcar = false) {
  const CHAVE = "tour-admin-v1";
  if (!forcar && jaViu(CHAVE)) return;

  // Garante que a primeira aba (Alunos) está ativa antes de começar
  document.querySelector(".aba[data-painel='painel-alunos']")?.click();

  await iniciarTour(CHAVE, [
    {
      element: ".topo .barra",
      popover: {
        title: "👋 Bem-vindo à Coordenação!",
        description: "Este é o painel central da EBD. Aqui você gerencia alunos, turmas, professores e muito mais. Vamos fazer um tour rápido!",
        side: "bottom", align: "start"
      }
    },
    {
      element: ".abas",
      popover: {
        title: "📂 Abas de navegação",
        description: "Cada aba abre uma área diferente: Alunos, Professores, Turmas, Matrículas, Importação, Usuários e Avaliações.",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#form-aluno",
      popover: {
        title: "👤 Cadastrar aluno",
        description: "Preencha o nome (obrigatório) e os dados de contato. O código EBD-XXXX é gerado automaticamente — nunca haverá duplicatas.",
        side: "right", align: "start"
      }
    },
    {
      element: "#lista-alunos",
      popover: {
        title: "📋 Lista de alunos",
        description: "Todos os alunos cadastrados aparecem aqui. Cada linha tem um botão 'Cartão' para gerar o cartão digital de identificação.",
        side: "top", align: "start"
      }
    },
    {
      element: ".aba[data-painel='painel-turmas']",
      popover: {
        title: "🏫 Turmas",
        description: "Crie as turmas da EBD aqui: Hebraico I, Grego I, Doutrina Bíblica etc. Vincule um professor a cada turma.",
        side: "bottom", align: "start"
      }
    },
    {
      element: ".aba[data-painel='painel-importar']",
      popover: {
        title: "📥 Importação em massa",
        description: "Tem uma lista de alunos em Excel ou CSV? Importe todos de uma vez. O sistema detecta duplicatas automaticamente antes de gravar.",
        side: "bottom", align: "start"
      }
    },
    {
      element: ".aba[data-painel='painel-usuarios']",
      popover: {
        title: "🔐 Usuários e aprovação",
        description: "Quando um professor criar a conta dele no site, ele aparece aqui como 'pendente'. Você aprova e define o papel (Professor ou Coordenador).",
        side: "bottom", align: "start"
      }
    },
    {
      element: "a[href='dashboard.html']",
      popover: {
        title: "📊 Dashboard",
        description: "Clique aqui para ver métricas consolidadas: frequência média, alertas de evasão, e desempenho por turma com gráficos.",
        side: "bottom", align: "end"
      }
    },
    {
      popover: {
        title: "✅ Pronto para começar!",
        description: "Sugestão de ordem: 1️⃣ Crie as turmas → 2️⃣ Cadastre professores → 3️⃣ Aprove os usuários → 4️⃣ Importe os alunos. Bom trabalho!",
      }
    }
  ]);
}

// ============================================================
// TOUR DO PROFESSOR
// ============================================================
export async function tourProfessor(forcar = false) {
  const CHAVE = "tour-professor-v1";
  if (!forcar && jaViu(CHAVE)) return;

  await iniciarTour(CHAVE, [
    {
      element: ".topo .barra",
      popover: {
        title: "👋 Painel do Professor",
        description: "Aqui você abre a chamada do dia e registra a presença dos alunos. É simples e rápido — vamos ver como funciona!",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#sel-turma",
      popover: {
        title: "🏫 Selecione a turma",
        description: "Escolha aqui a turma que você vai chamar. Só aparecem as turmas vinculadas ao seu cadastro de professor.",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#qr-canvas",
      popover: {
        title: "📲 QR Code da turma",
        description: "Este QR é FIXO — imprima uma vez e cole na parede da sala. Os alunos leem para se matricular na turma (a qualquer momento).",
        side: "left", align: "center"
      }
    },
    {
      element: "#btn-baixar-qr",
      popover: {
        title: "⬇️ Baixar o QR",
        description: "Clique aqui para baixar o QR em PNG e imprimir. Recomendamos plastificar e fixar na entrada da sala.",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#btn-abrir",
      popover: {
        title: "▶️ Abrir a chamada",
        description: "No início de cada aula, clique aqui para abrir a chamada do dia. A lista de matriculados aparece abaixo.",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#lista-chamada",
      popover: {
        title: "✅ Marcar presença",
        description: "Todos começam como 'Ausente'. Toque no botão ao lado de cada aluno para marcar como 'Presente'. A alteração é salva instantaneamente.",
        side: "top", align: "start"
      }
    },
    {
      element: "#contador",
      popover: {
        title: "🔢 Contador em tempo real",
        description: "Este número mostra quantos alunos estão presentes vs. o total de matriculados. Atualiza automaticamente a cada marcação.",
        side: "bottom", align: "end"
      }
    },
    {
      element: "#btn-encerrar",
      popover: {
        title: "⏹️ Encerrar a chamada",
        description: "Ao final da aula, clique aqui para encerrar. Só sessões encerradas entram no cálculo de frequência dos alunos.",
        side: "bottom", align: "start"
      }
    },
    {
      popover: {
        title: "✅ Tudo certo!",
        description: "Fluxo completo: Abrir chamada → Marcar presença → Encerrar. Simples assim. Boa aula! 📖",
      }
    }
  ]);
}

// ============================================================
// TOUR DO ALUNO (matrícula)
// ============================================================
export async function tourAluno(forcar = false) {
  const CHAVE = "tour-aluno-v1";
  if (!forcar && jaViu(CHAVE)) return;

  await iniciarTour(CHAVE, [
    {
      element: ".topo .barra",
      popover: {
        title: "👋 Bem-vindo à EBD IBC!",
        description: "Esta página é onde você se matricula na turma. O processo é rápido — só precisa do seu CPF!",
        side: "bottom", align: "start"
      }
    },
    {
      element: "#passo-cpf",
      popover: {
        title: "🔢 Informe seu CPF",
        description: "Digite seu CPF para o sistema verificar se você já tem cadastro. Se não tiver, faremos um cadastro rápido agora.",
        side: "top", align: "center"
      }
    },
    {
      popover: {
        title: "📋 O que acontece depois?",
        description: "Se você já tem cadastro → confirmamos sua matrícula nesta turma.\n\nSe for novo → pedimos seu nome e telefone para criar seu cadastro (vale para todas as turmas futuras).",
      }
    },
    {
      popover: {
        title: "✅ Presença é com o professor!",
        description: "Importante: você não precisa fazer nada para registrar presença. O professor marca quem está presente no início de cada aula. Só apareça! 😄",
      }
    },
    {
      popover: {
        title: "📊 Consulte sua frequência",
        description: "Depois de matriculado, você pode consultar sua frequência em qualquer momento em:\noreonsolucoes.github.io/EBD-Crescer/area.html",
      }
    }
  ]);
}

// Exporta utilitários para os botões "Ver tour novamente"
export { jaViu, resetarTour };
