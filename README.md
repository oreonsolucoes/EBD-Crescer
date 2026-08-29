# Sistema EBD IBC

Sistema de gestão da Escola Bíblica Dominical da **Igreja Batista da Cidade — IBC**.
Aplicação web estática (HTML + CSS + JavaScript ES Modules) sobre **Firebase / Cloud Firestore + Auth**, hospedada no **GitHub Pages**. Sem build, sem servidor, custo zero.

## O que já está pronto (Sprints 1 a 4)

- **Cadastros** (coordenação): alunos, professores, turmas, matrículas.
- **Código único `EBD-XXXX`** gerado de forma atômica (transação Firestore).
- **Importação em massa** CSV/XLSX com dedup e pré-visualização.
- **Autenticação** (Sprint 2): auto-cadastro → aprovação pela coordenação → papéis (coordenador/professor).
- **Auto-matrícula por QR Code** (Sprint 3-4): cada turma tem um QR **fixo**. O aluno lê, informa o **CPF**, e:
  - se já tem cadastro → confirma matrícula na turma;
  - se não tem → faz um cadastro rápido (nome, telefone, CPF) que vale para esta e futuras turmas.
- **Presença validada pelo professor** (Sprint 4): o professor abre a chamada do dia e marca **Presente/Ausente** na lista de matriculados, em tempo real. O aluno não marca presença.

---

## Fluxo em uma olhada

```
ALUNO                          PROFESSOR                    COORDENAÇÃO
  |                                |                             |
  | lê QR fixo da turma            | login (aprovado)            | login (1º vira coord.)
  | informa CPF                    | escolhe turma               | aprova cadastros e papéis
  |  ├ já existe → matricula       | Abrir chamada               | cadastra turmas/professores
  |  └ novo → cadastro rápido      | marca Presente/Ausente ✓    | importa alunos em massa
  |     + matrícula                | (tempo real)                |
```

---

## Estrutura de arquivos

```
public/
  index.html          # login / criar conta
  admin.html          # coordenação: cadastros, importação, aprovação de usuários
  professor.html      # abrir chamada + QR + lista de presença (toggle)
  matricula.html      # página que o aluno abre pelo QR (auto-matrícula por CPF)
  css/main.css
  js/
    firebase-config.js  # <-- cole suas credenciais aqui
    auth.js             # Firebase Auth + papéis + guarda de página
    db.js               # CRUD + código atômico + dedup + chamadas + presença
    importador.js       # CSV/XLSX + pré-visualização + gravação em lote
    scanner.js          # geração de QR Code
    app-login.js / app-admin.js / app-professor.js / app-matricula.js
firestore.rules         # regras de segurança por papel
firestore.indexes.json  # índices
.github/workflows/deploy.yml
seed/                   # dados fictícios de teste
```

---

## Passo a passo de configuração

### 1. Firebase Console
1. <https://console.firebase.google.com> → **Adicionar projeto**.
2. **Firestore Database → Criar** (modo produção, região `southamerica-east1`).
3. **Authentication → Começar → Sign-in method → E-mail/senha → Ativar.**
4. **Registrar app Web** (`</>`), apelido `ebd-web`, sem Hosting. Copie o `firebaseConfig`.

### 2. Colar credenciais
Edite `public/js/firebase-config.js` com os valores do seu `firebaseConfig`. (Essas chaves são públicas por design; a segurança vem das regras.)

### 3. Publicar as regras
Firebase Console → **Firestore → Regras** → cole `firestore.rules` → **Publicar**.

### 4. GitHub Pages
```bash
git init && git add . && git commit -m "EBD IBC — bloco 1"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/ebd-ibc.git
git push -u origin main
```
No GitHub: **Settings → Pages → Source: GitHub Actions**. Em ~1 min o site sobe em
`https://SEU-USUARIO.github.io/ebd-ibc/`.

### 5. Primeiro acesso
- Abra o site, **Criar conta** com seu e-mail. **Você é o primeiro usuário → vira coordenador automaticamente.**
- Cadastre um professor pela tela do professor? Não: peça para o professor criar a conta dele; depois, em **admin.html → Usuários**, aprove e defina o papel **Professor** (e vincule ao registro de professor, se quiser filtrar as turmas dele).

---

## Roteiro de teste (dados fictícios)

1. **Coordenação (admin.html):**
   - Crie a turma `TURMA-HEB1` / “Hebraico I”.
   - Importe `seed/alunos-ficticios.csv` (aba Importar) para ter alunos com CPF na base.
2. **Aluno (matricula.html via QR):**
   - No painel do professor, escolha `TURMA-HEB1` e clique **Baixar QR da turma** (ou leia o QR na tela).
   - Abra o link `matricula.html?turma=TURMA-HEB1`.
   - Digite o CPF de um aluno importado (ex.: `111.222.333-44`) → deve oferecer **matricular**.
   - Digite um CPF que não existe → deve pedir **cadastro rápido** → cria `EBD-XXXX` + matrícula.
3. **Professor (professor.html):**
   - Escolha `TURMA-HEB1`, clique **Abrir chamada**.
   - A lista de matriculados aparece; marque alguns **Presente**. O contador `X / Y` atualiza.
   - Encerre a chamada.

### O que precisa acontecer
- [ ] 1º usuário vira coordenador; demais ficam pendentes até aprovação.
- [ ] CPF existente → oferece matrícula; CPF novo → cadastro rápido, sem duplicar quem já existe.
- [ ] Professor marca/desmarca presença e o contador reflete na hora.
- [ ] Aluno nunca marca a própria presença.

---

## ⚠️ Nota de segurança honesta (Bloco 1)

Como o **aluno não faz login**, a auto-matrícula precisa que algumas coleções sejam **legíveis/graváveis publicamente** (`alunos`, `matriculas`, `turmas`, contador). As regras já **restringem escrita sensível** (turmas, presença, papéis) à equipe autenticada, mas um usuário técnico poderia, hoje, ler a lista de alunos ou criar matrículas fora do app. Isso é aceitável para colocar o sistema no ar rapidamente com a igreja, **mas deve ser endurecido** no próximo bloco movendo a auto-matrícula para uma **Cloud Function** (que valida o CPF sem expor a coleção). Está marcado como dívida técnica e documentado nas próprias regras.

Recomendação prática até lá: use o sistema normalmente, mas evite cadastrar dados sensíveis além de nome/telefone/CPF.

---

## Próximo bloco (Sprints 5-7)
Leitura de QR pela câmera, cartão digital do aluno e área do aluno (histórico de frequência). E o endurecimento de segurança citado acima.
