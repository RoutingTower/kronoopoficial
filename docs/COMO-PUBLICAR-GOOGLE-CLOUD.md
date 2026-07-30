# Como publicar no Google Cloud — do zero até o site no ar

Guia alternativo ao [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md), usando só
serviços Google: **Firebase Hosting** (frontend) + **Cloud Run**
(backend) + **Firestore** (banco — o mesmo de antes). Como o Firestore já
é um produto Firebase/Google Cloud, esse caminho concentra tudo numa
conta só e evita o "sono" de 30–50s do plano free do Render.

Tempo estimado: 1–2 horas na primeira vez. Custo: dentro do free tier do
Cloud Run e do Firebase Hosting para o uso deste projeto, mas o Cloud Run
**exige cartão de crédito cadastrado no projeto GCP** mesmo para ficar
dentro do free tier — é assim que o Google Cloud funciona (diferente do
Render/GitHub Pages, que não pedem cartão).

## Visão geral do que vamos montar

```
Firebase Hosting (frontend, estático)  --fetch-->  Cloud Run (backend, container Node.js)  --firebase-admin-->  Firestore (mesmo projeto Firebase)
```

Todo-list:
- [ ] 0. Pré-requisitos (contas e ferramentas)
- [ ] 1. Rodar localmente com dados de demonstração
- [ ] 2. Criar e conectar seu projeto Firebase
- [ ] 3. Publicar o backend no Cloud Run
- [ ] 4. Publicar o frontend no Firebase Hosting
- [ ] 5. Conectar o frontend ao backend publicado
- [ ] 6. Verificação final
- [ ] 7. (Opcional) Automatizar redeploy via GitHub Actions

---

## Passo 0 — Pré-requisitos

Contas:
- Uma conta Google (para Firebase **e** Google Cloud — é a mesma conta).
- Cartão de crédito associado ao projeto (obrigatório para habilitar
  faturamento no Google Cloud, requisito do Cloud Run mesmo dentro do
  free tier).

Ferramentas na sua máquina:
- **Node.js** (v18+) — https://nodejs.org
- **Git** — https://git-scm.com/downloads
- **gcloud CLI** — https://cloud.google.com/sdk/docs/install
- **Firebase CLI** — `npm install -g firebase-tools`

Verifique:
```
node --version
git --version
gcloud --version
firebase --version
```

---

## Passo 1 — Rodar localmente com dados de demonstração

Igual ao guia original — veja [`COMO-PUBLICAR.md`, Passo 1](COMO-PUBLICAR.md#passo-1--rodar-localmente-com-dados-de-demonstração).
Confirme que `frontend/index.html` abre e loga com senha `demo123` antes
de tocar em qualquer conta.

---

## Passo 2 — Criar e conectar seu projeto Firebase

Mesmo processo do guia original — veja
[`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) e
[`COMO-PUBLICAR.md`, Passo 2](COMO-PUBLICAR.md#passo-2--criar-e-conectar-seu-projeto-firebase).
Resumo:

1. Crie um projeto em https://console.firebase.google.com (isso **já
   cria** um projeto Google Cloud por baixo — é o mesmo `PROJECT_ID` que
   vamos usar no Cloud Run).
2. Ative Firestore Database + Authentication (E-mail/senha).
3. Gere uma service account (Configurações → Contas de serviço → Gerar
   nova chave privada) e preencha `backend/.env` localmente para testar
   com `npm run dev` + `node scripts/seed-firestore.js`.
4. No terminal, autentique as duas CLIs com a mesma conta:
   ```
   gcloud auth login
   gcloud config set project SEU-PROJECT-ID
   firebase login
   ```

---

## Passo 3 — Publicar o backend no Cloud Run

Este pacote já vem com [`backend/Dockerfile`](../backend/Dockerfile)
pronto — o Cloud Run builda a imagem sozinho a partir dele, sem precisar
de Docker instalado na sua máquina (usa o Cloud Build por trás).

Habilite as APIs necessárias (só na primeira vez):
```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

Como o `FIREBASE_PRIVATE_KEY` tem múltiplas linhas, o jeito mais seguro é
um arquivo YAML de variáveis de ambiente (não commite esse arquivo — já
cabe na mesma regra do `.env`):

Crie `backend/.env.yaml` (baseado em `backend/.env.example`):
```yaml
FIREBASE_PROJECT_ID: "seu-project-id"
FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-xxxx@seu-project-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n"
```

Deploy (a partir da raiz do projeto):
```
gcloud run deploy kronoop-backend \
  --source backend \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --env-vars-file backend/.env.yaml
```
- Troque `southamerica-east1` pela região mais próxima dos seus usuários
  (não precisa ser a mesma do Firestore, mas ajuda na latência).
- `--allow-unauthenticated` é necessário — sem isso o frontend não
  consegue chamar a API.
- Primeiro deploy demora 3–5 min (build da imagem). Ao final, o comando
  imprime a **Service URL** (formato
  `https://kronoop-backend-xxxxxxxxxx.região.run.app`) — anote.

Teste:
```
curl https://SUA-URL-DO-CLOUD-RUN/api/health
```
Deve responder `{"status":"ok"}`.

**Nota sobre cold start**: o Cloud Run também escala a zero por padrão,
então a primeira requisição após um período ocioso pode demorar alguns
segundos (bem menos que os 30-50s do Render free, mas não é instantâneo).
Se quiser eliminar isso, configure `--min-instances 1` (sai do free tier,
passa a cobrar por instância sempre ativa).

---

## Passo 4 — Publicar o frontend no Firebase Hosting

Este pacote já vem com [`firebase.json`](../firebase.json) configurado
para publicar a pasta `frontend/`. Falta só ligar ao seu projeto:

```
firebase use --add
```
Escolha o mesmo projeto Firebase do Passo 2 e dê um alias (ex.: `default`)
— isso cria um `.firebaserc` local (não commitado por padrão, veja nota
abaixo).

Deploy:
```
firebase deploy --only hosting
```
Ao final, o comando imprime a **Hosting URL**
(formato `https://seu-project-id.web.app`).

**Nota sobre `.firebaserc`**: o `.gitignore` deste projeto deixa esse
arquivo de fora do controle de versão por padrão (cada dev configura o
próprio projeto). Se você quiser fixar o projeto no repositório para que
o redeploy automático (Passo 7) funcione, remova o comentário da linha
`# .firebaserc` no `.gitignore` e commite o arquivo.

---

## Passo 5 — Conectar o frontend ao backend publicado

Edite `frontend/js/state.js` e troque o placeholder pela **Service URL**
do Cloud Run (Passo 3):

```js
const API_BASE = isLocalDev ? 'http://localhost:3001/api' : 'https://kronoop-backend-xxxxxxxxxx.região.run.app/api';
```

Depois, republique o frontend:
```
firebase deploy --only hosting
```

**CORS**: o backend já vem configurado com `cors()` sem restrições
(`backend/src/server.js`), então aceita requisições de qualquer origem,
incluindo o domínio do Firebase Hosting — não precisa mexer em nada
aqui.

---

## Passo 6 — Verificação final

1. Abra `https://seu-project-id.web.app`.
2. Faça login com um usuário de demonstração (senha `demo123`).
3. Crie um lembrete ou finalize uma operação.
4. Recarregue a página — o dado deve continuar lá (prova que está
   gravando no Firestore real).
5. Confira no Firebase Console → Firestore Database que o documento
   apareceu.

Se algo não persistir: DevTools (F12) → Console — o erro mais comum é o
`API_BASE` (Passo 5) errado ou a API do Cloud Run não habilitada
(Passo 3).

---

## Passo 7 — (Opcional) Automatizar redeploy via GitHub Actions

Diferente do guia original (que já vem com o workflow pronto), aqui a
automação exige configurar **Workload Identity Federation** (autenticação
sem chave estática entre GitHub Actions e Google Cloud), o que tem mais
passos manuais no console GCP. Enquanto isso não estiver configurado,
redeploy é manual: repita `gcloud run deploy ...` (Passo 3) e
`firebase deploy --only hosting` (Passo 4) a cada mudança.

Se quiser automatizar depois, os pontos de partida oficiais são:
- Cloud Run: action `google-github-actions/deploy-cloudrun`.
- Firebase Hosting: action `FirebaseExtended/action-hosting-deploy`.

Ambos com passo a passo de configuração de Workload Identity Federation
nas respectivas páginas do GitHub Marketplace.

---

## Troubleshooting

**`gcloud run deploy` falha com erro de faturamento (billing)**
→ O projeto GCP não tem uma conta de faturamento vinculada. Vá em
https://console.cloud.google.com/billing, vincule um cartão, e tente de
novo.

**`gcloud run deploy` falha com "Permission denied" nas APIs**
→ Rode `gcloud services enable run.googleapis.com cloudbuild.googleapis.com`
e tente de novo.

**Erros de Firebase (credenciais, PEM inválido, etc.)**
→ Ver a seção "Troubleshooting" completa em [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md).
O erro mais comum no `.env.yaml` é quebra de linha errada no
`FIREBASE_PRIVATE_KEY` — copie o valor exatamente como está no `.env`
local que já funcionou no Passo 2.

**Site no ar mas lembretes/dados somem ao recarregar**
→ O `API_BASE` (Passo 5) ainda aponta pro placeholder ou está com a URL
errada — confira no DevTools (F12 → Console) se aparece erro de rede.
