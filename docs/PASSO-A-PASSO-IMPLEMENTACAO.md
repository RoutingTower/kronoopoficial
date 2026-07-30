# KronoOP — Passo a passo de implementação (do zero até o site no ar)

Este é o guia único e completo para colocar o KronoOP no ar, escrito para
quem **nunca configurou um site antes**. Ele não pressupõe conhecimento
prévio de programação — só que você consiga instalar programas e copiar/
colar comandos exatamente como escritos.

Ao final deste guia você vai ter:
- Um banco de dados real (Firebase/Firestore) guardando os dados do
  sistema.
- O backend (a "API", o programa que fala com o banco) publicado e
  rodando 24 horas por dia.
- O frontend (o site que os usuários acessam) publicado com um endereço
  próprio, funcionando com dados reais (não mais o modo demonstração).

**Caminho usado neste guia**: Google Cloud — Firebase Hosting (site) +
Cloud Run (API) + Firestore (banco). Tudo na mesma conta Google, sem
precisar de uma conta separada de hospedagem. **Único requisito
incomum**: o Cloud Run pede um cartão de crédito cadastrado no projeto
Google Cloud (explicado no Passo 0) — mesmo assim, o uso deste projeto
fica dentro da cota gratuita.

> Existe um caminho alternativo sem cartão de crédito (GitHub Pages +
> Render), com o mesmo nível de detalhe, em
> [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md). Se você não quiser cadastrar
> cartão em lugar nenhum, use aquele guia em vez deste.

Tempo total estimado: **2 a 3 horas** na primeira vez. A maior parte é
espera (downloads, criação de contas, deploys rodando sozinhos), não
trabalho ativo.

---

## Glossário rápido (leia antes de começar)

Se algum termo abaixo aparecer mais adiante e você esquecer o que
significa, volte aqui.

| Termo | O que é |
|---|---|
| **Terminal** | A janela de texto onde você digita comandos em vez de clicar. No Windows, usaremos o **PowerShell** (já vem instalado — procure "PowerShell" no menu Iniciar). |
| **Comando** | Uma linha de texto que você cola no terminal e aperta Enter para executar. Todo bloco cinza com fonte de código neste guia é para colar no terminal, um bloco de cada vez. |
| **CLI** | "Command Line Interface" — um programa que você controla via terminal em vez de uma janela com botões. Vamos instalar 3: `git`, `gcloud` e `firebase`. |
| **Repositório (repo)** | A pasta do projeto controlada pelo Git — não é obrigatório para este guia, mas ajuda a manter histórico do que você mudou. |
| **Deploy / publicar / implantar** | O ato de colocar o código para rodar em um servidor público, acessível por qualquer pessoa com o link. |
| **Backend / API** | O programa que roda escondido, atende pedidos do site e fala com o banco de dados. Aqui, é a pasta `backend/`. |
| **Frontend** | O que o usuário vê e clica — aqui, a pasta `frontend/` (HTML/CSS/JS). |
| **Variável de ambiente** | Um valor de configuração (como uma senha ou um ID) que fica fora do código, configurado no servidor onde o backend roda. |
| **Firestore** | O banco de dados que vamos usar — parte do Firebase (que é do Google). |
| **Service account / credencial** | Um "usuário robô" que o backend usa para se autenticar no Firestore sem precisar de senha humana. |

---

## Checklist geral

- [ ] Parte 0 — Pré-requisitos (contas, cartão, programas)
- [ ] Parte 1 — Instalar ferramentas na sua máquina
- [ ] Parte 2 — Conferir que o frontend abre
- [ ] Parte 3 — Criar o banco de dados real (Firebase)
- [ ] Parte 4 — Testar o backend local com o banco real
- [ ] Parte 5 — Publicar o backend (Cloud Run)
- [ ] Parte 6 — Publicar o frontend (Firebase Hosting)
- [ ] Parte 7 — Conectar frontend e backend publicados
- [ ] Parte 8 — Verificação final
- [ ] Parte 9 — Manutenção (como atualizar o site depois)

---

## Parte 0 — Pré-requisitos

### Contas necessárias
- **Uma conta Google** (Gmail serve). Vai ser usada tanto para o Firebase
  quanto para o Google Cloud — é a mesma coisa por baixo dos panos.

### Cartão de crédito
O Google Cloud (dono do Cloud Run) exige um cartão cadastrado para
habilitar o faturamento do projeto, mesmo que você nunca saia do uso
gratuito. Isso é uma exigência do Google, não deste projeto. Se preferir
não cadastrar cartão em nenhum lugar, pare aqui e use
[`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) (GitHub Pages + Render) em vez
deste guia.

### O que "gratuito" significa aqui
Dentro do volume de uso normal de um sistema pequeno/médio (a quantidade
de acessos e escritas no banco que o KronoOP gera), tanto o Cloud Run
quanto o Firestore e o Firebase Hosting ficam dentro da faixa gratuita
mensal do Google. Não há garantia de que isso nunca mude — se um dia o
uso crescer muito, vale acompanhar o painel de faturamento do Google
Cloud (Passo 0.1 abaixo mostra onde fica).

---

## Parte 1 — Instalar ferramentas na sua máquina

Você vai instalar 4 programas. Depois de cada um, tem um comando para
"conferir se instalou certo" — rode-o antes de seguir para o próximo.

Abra o **PowerShell** (menu Iniciar → digite "PowerShell" → Enter) e deixe
essa janela aberta — vamos usá-la o guia inteiro.

### 1.1 — Node.js

Baixe e instale em https://nodejs.org (escolha a versão "LTS", que é a
recomendada). Durante a instalação, pode manter todas as opções
padrão (clicar "Next" até o fim).

Confira:
```powershell
node --version
```
Deve mostrar algo como `v20.x.x` (qualquer versão 18 ou mais recente
serve). Se aparecer erro de "comando não reconhecido", feche e reabra o
PowerShell (às vezes é preciso reiniciar o terminal para reconhecer um
programa recém-instalado) e tente de novo.

### 1.2 — Git

Baixe e instale em https://git-scm.com/downloads. Pode manter as opções
padrão durante a instalação.

Confira:
```powershell
git --version
```

### 1.3 — Google Cloud CLI (`gcloud`)

Baixe o instalador em https://cloud.google.com/sdk/docs/install (escolha
a versão Windows). Rode o instalador — ele abre uma janela do PowerShell
no final para você fazer login; se isso acontecer, pode fazer o login
Google ali mesmo (ou pular e fazer no Passo 3.7).

Confira (feche e reabra o PowerShell antes, se necessário):
```powershell
gcloud --version
```

### 1.4 — Firebase CLI

Este se instala via `npm` (que já veio com o Node.js no Passo 1.1):
```powershell
npm install -g firebase-tools
```

Confira:
```powershell
firebase --version
```

Se todos os 4 comandos acima ("conferir") mostraram uma versão sem erro,
sua máquina está pronta.

---

## Parte 2 — Conferir que o frontend abre

Não existe modo offline neste projeto — login e dados sempre exigem o
backend e o Firebase configurados (próximas partes). Por enquanto, só
confirme que o arquivo abre sem erro:

1. Encontre a pasta do projeto (`KronoOP-cliente` ou o nome que você deu
   a ela) no Explorador de Arquivos.
2. Entre na pasta `frontend/` e dê duplo-clique em `index.html`. Ele deve
   abrir no seu navegador, mostrando a tela de login (campos de e-mail e
   senha).

Se a tela apareceu sem erro no console (F12 → Console), o frontend está
OK. Tentar logar agora vai dar erro de conexão — normal, ainda não existe
backend rodando. Feche essa aba, vamos seguir para o banco de dados real.

---

## Parte 3 — Criar o banco de dados real (Firebase)

### 3.1 — Criar o projeto no Firebase Console

1. Acesse https://console.firebase.google.com e faça login com sua conta
   Google.
2. Clique em **"Adicionar projeto"**.
3. Dê um nome (sugestão: `kronoop` ou o nome da sua empresa). O Firebase
   gera um **ID de projeto** único a partir do nome (ex.: `kronoop-a1b2c`)
   — **anote esse ID**, ele vai ser usado várias vezes mais adiante.
4. Google Analytics é opcional — pode desativar para simplificar.
5. Aguarde ~30 segundos e clique em **"Continuar"**.

### 3.2 — Ativar o Firestore Database

1. No menu lateral, **Build → Firestore Database**.
2. Clique em **"Criar banco de dados"**.
3. **Modo de segurança**: escolha **"Iniciar no modo de produção"**.
4. **Localização**: escolha a região mais perto de onde seus usuários
   estão (ex.: `southamerica-east1` para Brasil). **Essa escolha é
   permanente**, não dá pra mudar depois.
5. Clique em **"Ativar"**.

### 3.3 — Ativar o Firebase Authentication

1. No menu lateral, **Build → Authentication → "Vamos começar"**.
2. Aba **"Sign-in method"** → clique em **"E-mail/senha"**.
3. Ative o primeiro toggle e clique em **"Salvar"**.

(É esse método que o login do app usa de verdade — sem isso ativado,
ninguém consegue logar.)

### 3.4 — Gerar a service account (a credencial do backend)

Este é o "usuário robô" que o backend vai usar para falar com o
Firestore.

1. Clique na engrenagem ao lado de "Visão geral do projeto" →
   **"Configurações do projeto"**.
2. Aba **"Contas de serviço"**.
3. Clique em **"Gerar nova chave privada"** → confirme.
4. Um arquivo `.json` é baixado (algo como
   `kronoop-a1b2c-firebase-adminsdk-xxxxx.json`). Guarde-o num lugar que
   você lembre — vamos abrir esse arquivo no próximo passo.

**⚠️ Este arquivo dá acesso total ao seu banco de dados.** Nunca o envie
por e-mail, chat ou o suba a sites públicos. Depois de terminar este
guia, pode apagá-lo do seu computador (os valores que interessam já vão
estar salvos com segurança nos lugares certos).

### 3.5 — Configurar `backend/.env` (para testar localmente)

1. Abra o PowerShell na pasta do projeto e entre em `backend`:
   ```powershell
   cd caminho\para\KronoOP-cliente\backend
   Copy-Item .env.example .env
   ```
2. Abra o arquivo `backend/.env` recém-criado num editor de texto
   (Bloco de Notas serve) e abra também o arquivo `.json` baixado no
   passo anterior. Copie 3 valores do `.json` para o `.env`:

   | No `.env`, preencha... | ...com o valor do `.json` chamado |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `project_id` |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` |
   | `FIREBASE_PRIVATE_KEY` | `private_key` |

   O resultado deve ficar parecido com:
   ```
   PORT=3001
   FIREBASE_PROJECT_ID=kronoop-a1b2c
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kronoop-a1b2c.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
   ```

   **Atenção especial ao `FIREBASE_PRIVATE_KEY`**: copie o valor
   **exatamente como está** no `.json`, incluindo os `\n` (são dois
   caracteres — barra invertida e a letra "n" — não são quebras de linha
   reais). Cole tudo entre aspas duplas, numa linha só. Se colar com
   quebras de linha de verdade em vez do `\n` literal, vai dar erro de
   "invalid PEM" mais adiante — se isso acontecer, volte aqui e copie de
   novo com cuidado.

3. Salve o arquivo.

### 3.6 — Instalar as dependências do backend

```powershell
npm install
```
Isso baixa os pacotes que o backend precisa (Express, Firebase Admin,
etc.) para dentro de uma pasta `node_modules` — só precisa rodar uma vez
(ou de novo se o `package.json` mudar).

---

## Parte 4 — Testar o backend local com o banco real

Ainda no PowerShell, dentro de `backend/`:
```powershell
npm run dev
```
Deve aparecer `KronoOP API rodando em http://localhost:3001` sem
erros. **Deixe essa janela aberta e rodando** — ela é o backend.

Se aparecer um erro de credencial aqui, volte ao Passo 3.5 — é quase
sempre o `FIREBASE_PRIVATE_KEY` colado errado.

Popule o Firestore com os dados de demonstração — em outro terminal,
dentro de `backend/`:
```powershell
node scripts/seed-firestore.js
```
Isso cria 7 usuários de verdade no Firebase Auth (senha `demo123` para
todos) e popula as coleções (`baseMestra`, `ausencias`, etc.) no
Firestore. Confira no [Firebase Console](https://console.firebase.google.com)
→ seu projeto → Firestore Database — devem aparecer várias coleções com
documentos.

Agora, para testar de ponta a ponta:
1. Abra `frontend/index.html` de novo no navegador.
2. Faça login com um dos usuários criados pelo seed — ex.:
   `marina.cordeiro@kronoop.local`, senha `demo123`.
3. Crie um lembrete, ou finalize uma operação qualquer.
4. Volte ao Firestore Database no console — o dado que você criou deve
   aparecer na coleção correspondente (ex.: `lembretes`).

**Se os dados apareceram no Firestore Console, o banco está funcionando
de ponta a ponta.** Pode deixar esse backend local rodando ou parar com
`Ctrl+C` — a partir daqui, vamos publicar tudo para funcionar sem
precisar do seu computador ligado.

---

## Parte 5 — Publicar o backend (Cloud Run)

O Cloud Run vai rodar o backend 24h por dia, num link público. O
projeto já vem com o arquivo `backend/Dockerfile` pronto — ele descreve
como "empacotar" o backend, e o Google faz esse trabalho sozinho (você
não precisa instalar Docker).

### 5.1 — Ligar o `gcloud` à sua conta e ao seu projeto

```powershell
gcloud auth login
```
Isso abre o navegador para você logar com a mesma conta Google do
Firebase. Depois:
```powershell
gcloud config set project SEU-PROJECT-ID
```
Troque `SEU-PROJECT-ID` pelo ID anotado no Passo 3.1 (ex.: `kronoop-a1b2c`
— é o mesmo projeto do Firebase, só que agora acessado pelo lado
"Google Cloud").

### 5.2 — Habilitar o faturamento (billing)

1. Acesse https://console.cloud.google.com/billing.
2. Se ainda não tiver uma conta de faturamento, crie uma e cadastre o
   cartão.
3. Vincule o projeto `SEU-PROJECT-ID` a essa conta de faturamento (o
   próprio painel guia isso caso o projeto ainda não esteja vinculado).

### 5.3 — Habilitar as APIs necessárias (só na primeira vez)

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```
Isso demora ~1 minuto.

### 5.4 — Criar o arquivo de variáveis de ambiente de produção

Assim como fizemos com `backend/.env` (Passo 3.5), mas agora num arquivo
que o Cloud Run vai ler. Crie `backend/.env.yaml` (pode copiar os mesmos
3 valores do seu `backend/.env`):

```yaml
FIREBASE_PROJECT_ID: "kronoop-a1b2c"
FIREBASE_CLIENT_EMAIL: "firebase-adminsdk-xxxxx@kronoop-a1b2c.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
```

**Este arquivo não deve ser compartilhado nem enviado a lugar nenhum** —
mesma regra do `.env`. Ele já está coberto pelas regras de
`.gitignore` do projeto (arquivos `.env*` são ignorados).

### 5.5 — Rodar o deploy

Volte para a pasta raiz do projeto (a que contém `backend/` e
`frontend/` lado a lado) e rode:
```powershell
gcloud run deploy kronoop-backend --source backend --region southamerica-east1 --allow-unauthenticated --env-vars-file backend/.env.yaml
```
- Troque `southamerica-east1` pela região mais próxima dos seus usuários,
  se quiser.
- Esse comando vai perguntar algumas confirmações (digite `y` e Enter
  quando pedir).
- O primeiro deploy demora **3 a 5 minutos** (o Google está construindo a
  imagem a partir do `Dockerfile`). Não feche o terminal enquanto roda.
- Ao final, o comando imprime uma linha **"Service URL"** — algo como
  `https://kronoop-backend-xxxxxxxxxx-rj.a.run.app`. **Copie e guarde essa
  URL**, você vai precisar dela na Parte 7.

### 5.6 — Testar o backend publicado

Abra essa URL no navegador, adicionando `/api/health` no final — por
exemplo:
```
https://kronoop-backend-xxxxxxxxxx-rj.a.run.app/api/health
```
Deve mostrar `{"status":"ok"}`. Se isso apareceu, seu backend está no ar.

---

## Parte 6 — Publicar o frontend (Firebase Hosting)

O projeto já vem com o arquivo `firebase.json` configurado para publicar
a pasta `frontend/`.

### 6.1 — Ligar o Firebase CLI ao seu projeto

Na pasta raiz do projeto:
```powershell
firebase login
```
(Se já fez login com o mesmo navegador/conta antes, pode pular.)
```powershell
firebase use --add
```
Escolha o projeto criado no Passo 3.1 na lista, e dê um apelido (pode
digitar `default`).

### 6.2 — Fazer o deploy

```powershell
firebase deploy --only hosting
```
Ao final, aparece uma linha **"Hosting URL"** — algo como
`https://kronoop-a1b2c.web.app`. **Esse é o endereço do seu site.**

### 6.3 — Conferir que o site abriu

Abra a Hosting URL no navegador. Como não existe modo offline, tentar
logar agora dá erro de conexão — normal, falta o próximo passo (apontar o
frontend pro backend publicado).

---

## Parte 7 — Conectar frontend e backend publicados

1. Abra o arquivo `frontend/js/config.js` num editor de texto.
2. Encontre esta linha (perto do topo do arquivo):
   ```js
   const API_BASE = isLocalDev ? 'http://localhost:3001/api' : 'https://SEU-BACKEND.onrender.com/api';
   ```
3. Troque a parte depois de `:` (a URL de produção) pela **Service URL**
   do Cloud Run que você anotou no Passo 5.5, adicionando `/api` no
   final:
   ```js
   const API_BASE = isLocalDev ? 'http://localhost:3001/api' : 'https://kronoop-backend-xxxxxxxxxx-rj.a.run.app/api';
   ```
4. Salve o arquivo.
5. Republique o frontend:
   ```powershell
   firebase deploy --only hosting
   ```

---

## Parte 8 — Verificação final

1. Abra a Hosting URL (`https://kronoop-a1b2c.web.app`) — se possível,
   numa aba anônima/privada, para garantir que não é cache antigo.
2. Faça login com um dos usuários criados pelo seed (Parte 4) — ex.:
   `marina.cordeiro@kronoop.local`, senha `demo123`.
3. Crie um lembrete, ou finalize uma operação qualquer.
4. **Recarregue a página inteira** (F5). O dado deve continuar lá e você
   deve continuar logado — isso prova que está gravando no Firestore real
   e que a sessão persiste.
5. Confira no [Firebase Console](https://console.firebase.google.com) →
   Firestore Database → o documento/coleção apareceu.

Se tudo isso funcionou: **o site está em produção.** ✅

Se o dado sumiu ao recarregar:
- Abra o navegador, aperte **F12** (DevTools) → aba **Console** → veja se
  aparece algum erro em vermelho.
- O erro mais comum é o `API_BASE` (Parte 7) ainda com a URL errada ou
  faltando `/api` no final.
- Confirme testando `SUA-URL-DO-CLOUD-RUN/api/health` direto no
  navegador (Passo 5.6) — se isso não responder `{"status":"ok"}`, o
  problema está no backend, não no frontend.

---

## Parte 9 — Manutenção: como atualizar o site depois

Sempre que você (ou quem for dar manutenção) alterar algo no código:

**Mudou algo em `frontend/`?**
```powershell
firebase deploy --only hosting
```

**Mudou algo em `backend/`?**
```powershell
gcloud run deploy kronoop-backend --source backend --region southamerica-east1 --allow-unauthenticated --env-vars-file backend/.env.yaml
```

Nenhum dos dois é automático neste guia (diferente do caminho
GitHub Pages + Render, que redeploya sozinho a cada `git push` — ver
[`COMO-PUBLICAR-GOOGLE-CLOUD.md`, Passo 7](COMO-PUBLICAR-GOOGLE-CLOUD.md#passo-7--opcional-automatizar-redeploy-via-github-actions)
se quiser automatizar isso mais adiante).

---

## Problemas comuns

**"Comando não reconhecido" depois de instalar algo (Node, Git, gcloud)**
→ Feche a janela do PowerShell inteira e abra uma nova. Programas recém
instalados só aparecem em terminais abertos depois da instalação.

**`gcloud run deploy` falha mencionando faturamento/billing**
→ Volte ao Passo 5.2 — o projeto não tem cartão vinculado ainda.

**`gcloud run deploy` falha com "API not enabled"**
→ Rode de novo o comando do Passo 5.3.

**Erro `Failed to parse private key` / `Invalid PEM`**
→ O valor de `FIREBASE_PRIVATE_KEY` (Passo 3.5 ou 5.4) foi colado com
quebras de linha reais em vez do `\n` literal, ou está sem as aspas.
Copie de novo, com cuidado, exatamente como está no `.json` baixado.

**Site abre, mas os dados não persistem (some ao recarregar)**
→ Ver Parte 8, seção final.

**"Não sei o que é PowerShell / nunca abri um terminal"**
→ Aperte a tecla Windows, digite `powershell`, aperte Enter. Uma janela
preta ou azul-escura com texto vai abrir — é ali que todos os comandos
com fundo cinza deste guia devem ser colados (Ctrl+V), um bloco de cada
vez, apertando Enter depois de cada um.

**Quero recomeçar o banco de dados do zero**
→ Firebase Console → Firestore Database → apague as coleções uma a uma
(clique na coleção → "Excluir coleção"), ou apague o projeto inteiro em
Configurações do projeto → "Geral" → "Excluir projeto" e repita a
Parte 3.

---

## Próximos passos (não bloqueiam o site estar no ar)

Este guia entrega um site funcional em produção com dados reais. Duas
coisas ficam como evolução futura, não como pendência para "ir ao ar":

- **Login de verdade** (hoje é simplificado, serve para demonstração) —
  ver [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) → "Passo 9".
- **Regras de segurança do Firestore** (só relevantes se o frontend um
  dia acessar o banco direto, sem passar pelo backend) — ver
  [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) → "Passo 10".

Lista completa de melhorias sugeridas, em ordem de prioridade:
[`ROADMAP.md`](ROADMAP.md).
