# Como implementar o Firebase — passo a passo completo

> **Nota**: os Passos 1–7 abaixo (criar o projeto Firebase, gerar a
> service account, configurar `.env`, popular os dados) continuam válidos
> tal como estão — é o que qualquer pessoa provisionando **seu próprio**
> projeto Firebase precisa fazer. Os Passos 8 e 9 descreviam trabalho de
> desenvolvimento que já foi concluído no código (todos os controllers têm
> CRUD completo, e o login já é via Firebase Authentication de verdade,
> com autorização por role) — ficaram como resumo/referência, não como
> tarefa pendente. O Passo 10 (Security Rules) também já está feito e
> publicado — ver [`ROADMAP.md`](ROADMAP.md), itens 5 e 6, e a seção
> "Ambiente de produção separado" no fim deste guia.

Guia detalhado para sair do zero (nenhum projeto Firebase existe) até um
backend real, com Firestore persistindo dados e Firebase Authentication
cuidando do login.

Tempo estimado: 30–45 min para os passos 1–7 (Firestore funcionando de
verdade, com dados de demonstração).

## Checklist

- [ ] 1. Criar o projeto no Firebase Console
- [ ] 2. Ativar o Firestore Database
- [ ] 3. Ativar Firebase Authentication
- [ ] 4. Gerar a service account
- [ ] 5. Configurar `backend/.env`
- [ ] 6. Testar a conexão (subir o backend e bater nos endpoints)
- [ ] 7. Popular o Firestore com os dados de demonstração (seed)
- [x] 8. Controllers — já feitos, ver resumo no passo 8/9
- [x] 9. Login via Firebase Authentication — já feito, ver resumo no passo 8/9
- [x] 10. Firestore Security Rules — já feito, ver passo 10

---

## Pré-requisitos

- Uma conta Google.
- Node.js instalado (para rodar `backend/`).
- `backend/node_modules` instalado (`cd backend && npm install`) — o
  pacote `firebase-admin` já está no `package.json`, não precisa instalar
  nada a mais.

---

## Passo 1 — Criar o projeto no Firebase Console

1. Acesse https://console.firebase.google.com e faça login.
2. Clique em **"Adicionar projeto"** (ou "Criar projeto").
3. Dê um nome (sugestão: `kronoop` ou `kronoop-prod`). O Firebase gera um
   ID de projeto único a partir do nome (ex.: `kronoop-a1b2c`) — anote esse
   ID, é o valor que vai em `FIREBASE_PROJECT_ID`.
4. O Google Analytics é opcional para este projeto — pode desativar
   ("Não ativar o Google Analytics neste projeto") para simplificar.
5. Aguarde a criação (leva ~30s) e clique em **"Continuar"**.

Você cai no painel do projeto. É daqui que os próximos passos partem.

---

## Passo 2 — Ativar o Firestore Database

1. No menu lateral, vá em **Build → Firestore Database**.
2. Clique em **"Criar banco de dados"**.
3. **Modo de segurança**: escolha **"Iniciar no modo de produção"**
   (regras fechadas por padrão — ninguém lê/escreve sem permissão
   explícita). Isso não trava o backend: o backend usa o **Admin SDK**
   (via `firebase-admin`), que **ignora as Security Rules** e sempre tem
   acesso total. As rules só importam se algo (o frontend, por exemplo)
   um dia acessar o Firestore direto com o SDK de cliente — ver Passo 10.
4. **Localização**: escolha a região mais perto dos usuários (ex.:
   `southamerica-east1` para Brasil). **Essa escolha é permanente** — não
   dá pra mudar depois sem recriar o banco. Se não tiver certeza, escolha
   a região mais próxima geograficamente.
5. Clique em **"Ativar"**. Depois de alguns segundos, o Firestore está
   pronto — a tela mostra uma coleção vazia.

Nenhuma coleção precisa ser criada manualmente aqui. O Firestore cria
coleções e documentos automaticamente na primeira escrita — e o próprio
app faz essa primeira escrita sozinho (Passo 7).

---

## Passo 3 — Ativar Firebase Authentication

1. No menu lateral, vá em **Build → Authentication**.
2. Clique em **"Vamos começar"** / **"Get started"**.
3. Na aba **"Sign-in method"**, clique em **"E-mail/senha"**.
4. Ative o primeiro toggle ("E-mail/senha") — não precisa ativar o link
   de login sem senha. Clique em **"Salvar"**.

Isso deixa o provedor pronto, mas **nenhum usuário existe ainda** — os
usuários de hoje (`DB.users` no `seedDB()`) não viram usuários do Firebase
Auth automaticamente. Criar os usuários reais é trabalho do Passo 9
(trocar o login), não deste passo.

---

## Passo 4 — Gerar a service account

Este é o par de credenciais que o **backend** usa para falar com o
Firestore (via `firebase-admin`, em `backend/src/services/firestoreService.js`).

1. No Firebase Console, clique na engrenagem ao lado de "Visão geral do
   projeto" → **"Configurações do projeto"**.
2. Vá na aba **"Contas de serviço"** ("Service accounts").
3. Confirme que está em **"SDK Admin do Firebase"** (deve já estar por
   padrão), linguagem Node.js.
4. Clique em **"Gerar nova chave privada"** → confirme em **"Gerar
   chave"**.
5. Um arquivo `.json` é baixado (algo como
   `kronoop-a1b2c-firebase-adminsdk-xxxxx.json`).

**⚠️ Este arquivo dá acesso total ao Firestore e ao Auth do projeto.**
Trate como uma senha:
- **Nunca** faça commit dele no repositório.
- **Nunca** cole o conteúdo dele num chat, issue, ou lugar público.
- Depois de extrair os 3 valores que interessam (Passo 5), pode apagar o
  arquivo baixado — os valores já estarão em `backend/.env`, que está no
  `.gitignore` (`backend/.gitignore` já ignora `.env`).
- Se o arquivo vazar (ex.: commitado por engano), revogue a chave em
  "Contas de serviço" → gerencie as chaves existentes → delete a
  comprometida → gere uma nova.

O JSON baixado tem este formato (valores de exemplo):
```json
{
  "type": "service_account",
  "project_id": "kronoop-a1b2c",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@kronoop-a1b2c.iam.gserviceaccount.com",
  "client_id": "...",
  ...
}
```
Você só precisa de **3 campos** desse JSON: `project_id`, `client_email`,
e `private_key`.

---

## Passo 5 — Configurar `backend/.env`

1. Se ainda não existe, copie o template:
   ```powershell
   cd backend
   Copy-Item .env.example .env
   ```
2. Abra `backend/.env` e preencha os 3 valores a partir do JSON baixado:

   ```
   PORT=3001
   FIREBASE_PROJECT_ID=kronoop-a1b2c
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kronoop-a1b2c.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
   ```

   **O ponto que mais gera erro aqui é a `FIREBASE_PRIVATE_KEY`.** Copie o
   valor de `private_key` do JSON **exatamente como está**, incluindo as
   sequências literais `\n` (não são quebras de linha reais dentro do
   JSON — são o texto de dois caracteres, barra invertida + "n"). Cole
   entre aspas duplas, numa linha só. `backend/src/config/env.js` já faz a
   conversão de volta para quebras de linha reais:
   ```js
   privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
   ```
   Se colar a chave com quebras de linha reais (multi-linha) em vez do
   `\n` literal, o `dotenv` só lê a primeira linha e a autenticação falha
   com um erro de "invalid PEM" ou "Failed to parse private key".

3. Confira que `backend/.env` **não** aparece em nenhum diff/staged file
   se algum dia este projeto ganhar controle de versão — `backend/.gitignore`
   já lista `.env`, mas vale checar manualmente por segurança.

---

## Passo 6 — Testar a conexão

1. Suba o backend:
   ```powershell
   cd backend
   npm run dev
   ```
   Deve aparecer `KronoOP API rodando em http://localhost:3001` sem erros.
   Se aparecer um erro de credencial aqui, volte ao Passo 5 (quase sempre
   é a `FIREBASE_PRIVATE_KEY` mal formatada).

2. Em outro terminal, teste o endpoint de saúde:
   ```powershell
   Invoke-RestMethod http://localhost:3001/api/health
   ```
   Deve responder `{"status":"ok"}` — isso só confirma que o Express está
   de pé, ainda não testa o Firestore.

3. Toda rota `/api/*` (exceto `/health`) exige um Firebase ID token válido
   — chamar sem token deve dar `401`:
   ```powershell
   Invoke-WebRequest http://localhost:3001/api/users -SkipHttpErrorCheck
   ```
   Resultado esperado: **`401`** com corpo `{"error":"unauthorized",...}`.
   Isso confirma que o Express e o middleware de auth estão de pé — ainda
   não testa o Firestore em si (um token inválido também dá `401`, sem
   nunca chegar a consultar o banco).

4. Rode o seed (Passo 7 abaixo) e depois confira pelo app: faça login com
   um usuário de demonstração e veja os dados aparecerem. É o teste mais
   simples de ponta a ponta — exercita token real + Firestore junto. Se
   preferir confirmar via linha de comando antes disso, veja "Testar com
   curl/PowerShell" no fim deste passo.

   <details>
   <summary>Testar com curl/PowerShell (avançado — pega um ID token manualmente)</summary>

   ```powershell
   $apiKey = "SUA_API_KEY_WEB"  # a mesma do frontendConfig, não a service account
   $resp = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$apiKey" `
     -Body (@{ email="marina.cordeiro@kronoop.local"; password="demo123"; returnSecureToken=$true } | ConvertTo-Json) -ContentType "application/json"
   Invoke-RestMethod -Uri http://localhost:3001/api/users/me -Headers @{ Authorization = "Bearer $($resp.idToken)" }
   ```
   Deve retornar o documento da Marina (`role`, `name`, etc. — sem `pass`,
   esse campo não existe mais). Só funciona depois do Passo 7 (o usuário
   precisa existir no Firebase Auth e no Firestore).
   </details>

---

## Passo 7 — Popular o Firestore com os dados de demonstração

```powershell
cd backend
node scripts/seed-firestore.js
```

Isso cria, pra cada usuário de demonstração, uma conta real no Firebase
Auth (mesmo `uid` do documento Firestore, senha `demo123`) e popula todas
as coleções (`users`, `baseMestra`, `ausencias`, `suplencias`, `raioX`,
`recados`, `reunioes`, `plantoes`, `lembretes`) com o dataset descrito em
[`../db/README.md`](../db/README.md). Rodar de novo a qualquer momento
reseta os dados de demonstração (usuários já existentes no Auth são
mantidos, não duplicados).

Confira no Firebase Console → Firestore Database: devem existir as 9
coleções acima, cada uma com alguns documentos. Depois, abra
`frontend/index.html` (apontando pra esse backend — `API_BASE` em
`frontend/js/config.js` já resolve pra `http://localhost:3001/api`
automaticamente em `file://`/`localhost`) e faça login com um dos usuários
de demonstração (ex.: `marina.cordeiro@kronoop.local`, senha `demo123`).

**Cuidado**: se dois backends diferentes (ex.: `localhost:3001` local e um
deploy em produção) apontarem para o **mesmo** projeto Firebase, os dois
vão ler/escrever nas mesmas coleções. Para ambientes separados, crie um
projeto Firebase por ambiente (dev/prod) — mais barato e simples do que
tentar isolar dados dentro do mesmo projeto.

---

## Passos 8 e 9 — Controllers e login (já feitos)

Só um resumo, pra quem está lendo este guia depois — não é mais uma
tarefa pendente:

- **Todos os controllers têm CRUD completo** (`users`, `lembretes`,
  `baseMestra`, `ausencias`, `suplencias`, `raioX`, `recados`, `reunioes`,
  `plantoes`), cada um com endpoint próprio — ver
  [`../backend/README.md`](../backend/README.md) → "Módulos
  implementados". Não existe mais blob genérico (`/api/state` foi
  removido).
- **Login é via Firebase Authentication** (e-mail/senha), não mais
  comparação de string. `uid` do Auth = ID do documento `users/{uid}`;
  `pass` não existe em nenhuma coleção. Toda rota `/api/*` (exceto
  `/health`) exige um Firebase ID token válido, e cada mutação tem
  autorização por `role` (supervisor só mexe na própria equipe, etc.) —
  ver [`../backend/README.md`](../backend/README.md) → "Autenticação"
  para a lista completa. Um "modo demonstração" na tela de login preserva
  o uso 100% offline sem precisar de conta.

---

## Passo 10 — Firestore Security Rules (já feito)

O backend (Admin SDK) sempre ignora as rules — elas só protegem contra
acesso **direto** ao Firestore (ex.: se o frontend um dia usar o SDK de
cliente em vez de passar pelo backend). As regras já estão escritas
(`firestore.rules`, raiz do projeto) e publicadas nos dois projetos (dev e
produção):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

Leitura liberada pra qualquer usuário autenticado (espelha o que a API já
faz — nenhum `GET` tem checagem de role ainda, ver `backend/README.md`);
escrita sempre negada — toda escrita passa pelo backend, que aplica a
autorização por role de verdade (`authz.js`). Se um dia o app passar a
usar listeners em tempo real do Firestore direto do navegador, aperte a
leitura por coleção/role antes de liberar esse acesso.

Pra publicar (sem precisar do Firebase CLI autenticado interativamente):
```powershell
cd backend
node scripts/deploy-firestore-rules.js                                    # dev
$env:ENV_FILE=".env.production"; node scripts/deploy-firestore-rules.js   # produção
```
Roda de novo sempre que `firestore.rules` mudar. Usa a Firebase Rules API
direto com a service account (mesma do `.env`), sem passar pelo `firebase
deploy`.

---

## Ambiente de produção separado

Se o site publicado e um backend rodando local (`npm run dev`) apontarem
para o **mesmo** projeto Firebase, testar localmente altera os dados que
estão no ar. A solução é repetir os Passos 1–7 (e o Passo 10) num
**segundo projeto Firebase**, só para produção.

1. Repita os Passos 1–4 com um nome de projeto diferente (ex.:
   `kronoop-prod`) — Firestore, Authentication, service account.
2. Em vez de sobrescrever `backend/.env`, crie `backend/.env.production`
   (copie de `.env.production.example`) com as credenciais do projeto
   novo. Esse arquivo é ignorado pelo git (`.gitignore` já cobre `.env*`).
3. Rode os scripts contra esse ambiente apontando `ENV_FILE`:
   ```powershell
   cd backend
   $env:ENV_FILE=".env.production"; node scripts/seed-firestore.js
   $env:ENV_FILE=".env.production"; node scripts/deploy-firestore-rules.js
   ```
4. Registre um Web App nesse projeto (Configurações do projeto → Seus
   aplicativos → `</>`) e preencha `firebaseConfigProd` em
   `frontend/js/config.js` com o `firebaseConfig` gerado —
   `firebaseConfigDev` continua com o projeto de desenvolvimento. O
   frontend escolhe automaticamente qual usar (mesmo `isLocalDev` que já
   decide o `API_BASE`): aberto localmente usa dev, publicado usa
   produção.
5. Quando for publicar o backend de verdade (Cloud Run/Render — ver
   [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md)), use as variáveis de
   `.env.production` na configuração do serviço publicado, não as de
   `.env`.

Cada projeto Firebase é isolado por padrão — não tem como um vazar dado
pro outro por engano, mesmo que os dois backends rodem na sua máquina ao
mesmo tempo (em portas diferentes, ex.: `PORT=3002` pra testar produção
sem derrubar o backend de dev).

---

## Troubleshooting

**`Error: Failed to parse private key: Error: Invalid PEM formatted message`**
→ `FIREBASE_PRIVATE_KEY` no `.env` está com quebras de linha reais em vez
de `\n` literal, ou faltam as aspas. Volte ao Passo 5.

**`Error: 5 NOT_FOUND` ou `PERMISSION_DENIED` ao chamar qualquer endpoint**
→ Confira `FIREBASE_PROJECT_ID` — precisa ser o **ID do projeto** (ex.:
`kronoop-a1b2c`), não o nome de exibição escolhido no Passo 1.

**Qualquer endpoint autenticado retorna `500` em vez do resultado esperado**
→ A credencial está errada ou o Firestore não foi ativado (Passo 2). Veja
a mensagem de erro no terminal do backend — geralmente indica
`SERVICE_DISABLED` (Firestore não ativado) ou falha de autenticação com a
service account.

**Mudei `backend/.env` mas o erro continua**
→ `npm run dev` usa `node --watch`, que recarrega o processo ao salvar
arquivos `.js`, mas **não** relê variáveis de ambiente automaticamente em
toda versão do Node. Pare (`Ctrl+C`) e rode `npm run dev` de novo depois
de editar o `.env`.

**Quero resetar tudo e começar o Firestore do zero**
→ Firebase Console → Firestore Database → menu de três pontos ao lado do
nome do banco → não existe "excluir tudo" direto pela UI para bancos
grandes; para um projeto de teste, o caminho mais simples é excluir cada
coleção manualmente (clique na coleção → "Excluir coleção") ou excluir o
projeto inteiro em Configurações do projeto → "Geral" → "Excluir
projeto" e repetir o Passo 1.
