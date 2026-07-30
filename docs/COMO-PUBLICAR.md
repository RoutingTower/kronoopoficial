# Como publicar este projeto — do zero até o site no ar

Guia completo replicando exatamente o processo usado para publicar a
versão original deste projeto: Firebase (banco de dados) + GitHub Pages
(frontend) + Render (backend). Sem custo — todos os serviços usados têm
plano gratuito suficiente para este projeto.

Tempo estimado total: 1–2 horas na primeira vez (a maior parte é espera
de builds/deploys, não trabalho ativo).

## Visão geral do que vamos montar

```
GitHub Pages (frontend, estático)  --fetch-->  Render (backend, Node.js)  --firebase-admin-->  Firestore (seu projeto Firebase)
        ↑                                              ↑
  .github/workflows/deploy-pages.yml           Auto-Deploy do Render
  (já vem pronto neste pacote,                 (configurado no passo 4)
   roda a cada push em master)
```

## Checklist

- [ ] 0. Pré-requisitos (contas e ferramentas)
- [ ] 1. Conferir o frontend e preparar o backend local
- [ ] 2. Criar e conectar seu projeto Firebase
- [ ] 3. Colocar o projeto no GitHub
- [ ] 4. Publicar o frontend no GitHub Pages
- [ ] 5. Publicar o backend no Render
- [ ] 6. Conectar o frontend ao backend publicado
- [ ] 7. Verificação final

---

## Passo 0 — Pré-requisitos

Contas (todas gratuitas):
- Uma conta Google (para o Firebase).
- Uma conta no [GitHub](https://github.com) (para hospedar o código e o
  frontend).
- Uma conta no [Render](https://render.com) (para hospedar o backend) —
  pode entrar direto com "Sign in with GitHub".

Ferramentas na sua máquina:
- **Node.js** (v18 ou mais recente) — https://nodejs.org
- **Git** — https://git-scm.com/downloads (no Windows, também dá pra
  instalar via `winget install Git.Git` num terminal PowerShell)
- **GitHub CLI** (`gh`) — https://cli.github.com (opcional mas recomendado;
  no Windows: `winget install GitHub.cli`) — facilita bastante os passos
  3 e 4, mas dá pra fazer tudo pelo site do GitHub também.

Verifique que tudo foi instalado:
```
node --version
git --version
gh --version
```

---

## Passo 1 — Conferir o frontend e preparar o backend local

Não existe modo offline neste projeto — login e dados sempre exigem
backend e Firebase reais (próximos passos). Por enquanto:

1. Abra `frontend/index.html` direto no navegador (duplo-clique). Deve
   aparecer a tela de login (e-mail/senha), sem erro no console. Tentar
   logar agora dá erro de conexão — normal, ainda não existe backend.
2. Prepare o backend local (vamos rodar de verdade no Passo 2):
   ```
   cd backend
   npm install
   copy .env.example .env
   npm run dev
   ```
   Sem preencher o `.env`, o backend sobe mas falha ao falar com o
   Firestore — normal, vamos configurar isso no próximo passo.

---

## Passo 2 — Criar e conectar seu projeto Firebase

Guia detalhado, com troubleshooting e o esboço de Security Rules:
[`FIREBASE-SETUP.md`](FIREBASE-SETUP.md). Resumo:

1. Crie um projeto em https://console.firebase.google.com
2. Ative o **Firestore Database** (modo produção, escolha a região mais
   próxima dos seus usuários — **essa escolha é permanente**)
3. Ative o **Authentication** → método E-mail/senha
4. Gere uma **service account**: Configurações do projeto → Contas de
   serviço → Gerar nova chave privada
5. Preencha `backend/.env` (copie de `.env.example`) com os 3 valores do
   arquivo `.json` baixado: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY`
6. Teste: `cd backend && npm run dev`, depois em outro terminal
   `node scripts/seed-firestore.js` — isso popula seu Firestore com dados
   de demonstração (usuários, operações, etc.). Confira no Firebase
   Console → Firestore Database que as coleções apareceram.

**⚠️ O arquivo `.json` da service account e o `backend/.env` nunca devem
ser commitados ou compartilhados** — dão acesso total ao seu banco. O
`.gitignore` deste projeto já ignora `.env`.

---

## Passo 3 — Colocar o projeto no GitHub

Com o GitHub CLI (mais rápido):
```
cd "pasta-do-projeto"
git init
git add -A
git commit -m "Commit inicial"
gh auth login
gh repo create NOME-DO-SEU-REPO --private --source=. --remote=origin --push
```
- Escolha **público ou privado** conforme sua preferência — GitHub Pages
  no plano gratuito só funciona com repositório **público** (passo 4).
  Se quiser manter privado, você vai precisar de outra hospedagem para o
  frontend (Netlify e Vercel aceitam repositório privado no plano grátis).
- `gh auth login` abre o navegador para você logar — escolha GitHub.com,
  protocolo HTTPS.

Sem o GitHub CLI: crie o repositório manualmente em
https://github.com/new e siga as instruções de "…or push an existing
repository from the command line" que a própria página do GitHub mostra.

**Confira antes de commitar** (`git status`) que `backend/.env` **não**
aparece na lista de arquivos — se aparecer, o `.gitignore` não está
funcionando, pare e resolva antes de continuar.

---

## Passo 4 — Publicar o frontend no GitHub Pages

Este projeto já vem com o workflow pronto em
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) —
ele publica a pasta `frontend/` (não a raiz do repositório, porque o
frontend não fica lá) toda vez que você der `git push` na branch
`master`. Só falta ativar o Pages com a fonte certa:

**Com GitHub CLI:**
```
gh api repos/SEU-USUARIO/NOME-DO-SEU-REPO/pages -X POST -f build_type=workflow
```

**Pelo site**: Settings do repositório → Pages → em "Build and
deployment" → "Source", escolha **"GitHub Actions"** (não "Deploy from a
branch" — essa opção não serve pra pastas fora da raiz/`docs/`).

Depois de ativar, o primeiro deploy dispara sozinho (ou dê um novo
`git push`, ou rode manualmente: aba "Actions" do repositório → workflow
"Deploy frontend to GitHub Pages" → "Run workflow"). Acompanhe em
"Actions" até aparecer ✅. A URL do site é
`https://SEU-USUARIO.github.io/NOME-DO-SEU-REPO/`.

Nesse ponto o site já está no ar, mas ainda **sem backend conectado**
(login vai falhar) — o próximo passo resolve isso.

---

## Passo 5 — Publicar o backend no Render

1. Crie a conta em https://render.com (recomendado: "Sign in with
   GitHub", já libera acesso ao repositório).

**Caminho automatizado (recomendado)**: este pacote já vem com
[`render.yaml`](../render.yaml) na raiz (um "Blueprint" do Render) — ele
descreve root directory, build/start command e health check path sozinho,
sem precisar preencher esses campos manualmente. No dashboard: **New** →
**Blueprint** → conecte o repositório → o Render lê `render.yaml` e monta
o serviço com a configuração certa; só pede pra você preencher os 3
valores do Firebase (e opcionalmente `ALLOWED_ORIGINS`) na hora. Depois
disso, pule direto pro passo 6.

**Caminho manual** (se preferir montar campo a campo):
2. Dashboard → **New** → **Web Service** → conecte o repositório que
   você criou no passo 3.
3. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Em **Environment Variables**, adicione os mesmos 3 valores que estão
   no seu `backend/.env` local:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (cole o valor completo, com aspas e `\n`)
   - Não precisa adicionar `PORT` — o Render define isso sozinho.

   **Alternativa automatizada** (evita erro de copiar/colar a chave
   privada, a causa mais comum de `401` no login em produção): crie o
   Web Service primeiro sem preencher as variáveis, pegue o
   `RENDER_SERVICE_ID` dele (começa com `srv-`) e uma API key em Render →
   Account Settings → API Keys, depois rode
   `backend/scripts/sync-render-env.js` — ver
   [`../backend/README.md`](../backend/README.md) → "Sincronizar
   variáveis de ambiente com o Render". Ele lê o `backend/.env.production`
   local e envia os valores byte a byte pra API do Render.
5. Em **Advanced**: **Auto-Deploy** = Yes; **Health Check Path** =
   `/api/health`.
6. Clique em **Create Web Service** e aguarde o primeiro deploy (2–5 min).

Anote a URL gerada (formato `https://NOME-DO-SERVICO.onrender.com`).
Teste:
```
curl https://NOME-DO-SERVICO.onrender.com/api/health
```
Deve responder `{"status":"ok"}`.

**Nota sobre o plano gratuito**: o serviço "dorme" após ~15 min sem
receber requisição — o primeiro acesso depois disso demora 30–50s pra
responder. Normal no plano free; upgrade remove esse comportamento. Este
pacote já vem com
[`.github/workflows/keep-backend-alive.yml`](../.github/workflows/keep-backend-alive.yml),
que faz um ping em `/api/health` a cada 10 minutos pra reduzir a chance do
serviço dormir durante o uso — não precisa configurar nada, já roda
sozinho assim que o repositório estiver no GitHub (o frontend
(`frontend/js/state.js`/`main.js`) também reexperimenta chamadas que
falharem por causa desse "acordar", então mesmo um cold-start ocasional
tende a se resolver sozinho em vez de mostrar erro).

---

## Passo 6 — Conectar o frontend ao backend publicado

Edite `frontend/js/config.js` e troque o placeholder pela URL real do seu
backend (do passo 5):

```js
const API_BASE = isLocalDev ? 'http://localhost:3001/api' : 'https://NOME-DO-SERVICO.onrender.com/api';
```

Depois:
```
git add frontend/js/config.js
git commit -m "Conecta o frontend ao backend publicado"
git push
```
O push já dispara o redeploy do frontend (GitHub Actions) automaticamente.

**CORS**: o backend já vem configurado com `cors()` sem restrições
(`backend/src/server.js`), então aceita requisições de qualquer origem,
incluindo o GitHub Pages — não precisa mexer em nada aqui.

---

## Passo 7 — Verificação final

1. Abra `https://SEU-USUARIO.github.io/NOME-DO-SEU-REPO/`.
2. Faça login com e-mail/senha de um usuário real (criado via
   `backend/scripts/seed-firestore.js` ou pelo próprio app).
3. Crie um lembrete, ou finalize uma operação, ou qualquer ação que
   grave dado.
4. Recarregue a página — o dado deve continuar lá (prova que está
   gravando no Firestore de verdade).
5. Confira no Firebase Console → Firestore Database que o documento
   apareceu.

Se algo não persistir: abra o DevTools do navegador (F12) → aba Console
— o erro mais comum é a URL do `API_BASE` (passo 6) estar errada ou o
backend do Render ainda estar "dormindo" (primeira requisição demora,
tente de novo em 1 minuto).

---

## Depois de publicado

- **Redeploy automático**: todo `git push` em `master` reimplanta
  frontend e backend sozinhos. Não repita os passos 4/5.
- **Próximos passos de desenvolvimento** (login via Firebase Auth de
  verdade, Security Rules, etc.): [`ROADMAP.md`](ROADMAP.md).
- **Ambientes separados** (ex.: um Firebase/Render só para testes, outro
  para produção): repita os passos 2 e 5 com um projeto Firebase e um
  serviço Render novos, apontando para uma branch diferente se quiser.

## Troubleshooting

**`git push` falha com "Invalid username or token"**
→ Rode `gh auth setup-git` (se estiver usando GitHub CLI) e tente de
novo.

**`git push` falha com "refusing to allow an OAuth App to create or
update workflow ... without workflow scope"**
→ O token do `gh` não tem permissão para tocar em arquivos dentro de
`.github/workflows/`. Rode `gh auth refresh -h github.com -s workflow` e
autorize de novo no navegador.

**Erro "Your current plan does not support GitHub Pages for this
repository"**
→ O repositório está privado e sua conta GitHub é gratuita. Torne o
repositório público (`gh repo edit SEU-USUARIO/REPO --visibility public
--accept-visibility-change-consequences`) ou use outra hospedagem que
aceite repositório privado no plano grátis.

**Site no ar mas lembretes/dados somem ao recarregar**
→ O `API_BASE` (passo 6) ainda aponta pro placeholder ou está com a URL
errada — confira no DevTools (F12 → Console) se aparece erro de rede.

**Erros de Firebase (credenciais, PEM inválido, etc.)**
→ Ver a seção "Troubleshooting" completa em [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md).
