# KronoOP

Sistema de gestão de escalas/operação (analista · supervisor · coordenador).

Frontend em HTML/CSS/JS puro (sem build step) + backend em Node.js/Express
+ banco de dados Firebase (Firestore + Authentication).

## Site no ar

- **Frontend**: https://thiagoribeiro-sys.github.io/kronoopoficial/ (GitHub Pages)
- **Backend**: https://kronoopoficial.onrender.com (Render) — `/api/health`
  responde `{"status":"ok"}`. O bug de `401` na verificação do token
  (credencial do Firebase mal configurada nas variáveis de ambiente do
  Render, causado por colar a chave privada manualmente no painel) foi
  corrigido sincronizando as variáveis via
  `backend/scripts/sync-render-env.js` — ver
  [`backend/README.md`](backend/README.md) → "Sincronizar variáveis de
  ambiente com o Render". Login real (Firebase Auth) testado ponta a
  ponta contra o backend publicado.
- **Banco de dados**: projeto `kronosop-prod` (Firebase), separado do
  projeto de desenvolvimento — ver `docs/ROADMAP.md`, item 6.

## Comece por aqui

Este pacote já tem **todo o código pronto e funcionando** — o que falta é
só provisionar os serviços (Firebase, hospedagem) com a sua própria conta.
Passo a passo completo, do zero até o site no ar:

👉 **[`docs/PASSO-A-PASSO-IMPLEMENTACAO.md`](docs/PASSO-A-PASSO-IMPLEMENTACAO.md)**
— guia único, sem pular nenhuma etapa, para quem nunca publicou um site
(Google Cloud: Firebase Hosting + Cloud Run). Alternativas mais resumidas
(para quem já tem familiaridade): **[`docs/COMO-PUBLICAR.md`](docs/COMO-PUBLICAR.md)**
(GitHub Pages + Render, sem cartão de crédito) ou
**[`docs/COMO-PUBLICAR-GOOGLE-CLOUD.md`](docs/COMO-PUBLICAR-GOOGLE-CLOUD.md)**
(mesma stack do guia único, versão enxuta).

Resumo do que esse guia cobre:
1. Rodar o projeto localmente (sem precisar de conta nenhuma, usando
   dados de demonstração).
2. Criar seu projeto no Firebase (Firestore + Authentication) e conectar
   o backend a ele.
3. Publicar o frontend no GitHub Pages.
4. Publicar o backend no Render (ou serviço equivalente).
5. Conectar as duas pontas e confirmar que está tudo funcionando com o
   banco de dados real.

## Estrutura

```
frontend/     App (HTML + JS vanilla, sem build step). Entrada em
              frontend/index.html, com frontend/css/style.css e os
              módulos em frontend/js/ (state, utils, ui, render-*,
              events, main).

backend/      API em Node.js + Express, com Firebase (Firestore) como
              banco — todos os recursos com CRUD completo. Ver
              backend/README.md.

db/           Documentação do banco de dados (Firestore): formato de
              cada coleção. Ver db/README.md.

docs/         Documentação de arquitetura, convenções do frontend, guia
              de contribuição, e como publicar (Firebase + GitHub Pages
              + Render, ou Firebase Hosting + Cloud Run). Comece por
              docs/README.md.

.github/      Workflow do GitHub Actions que publica frontend/ no
workflows/    GitHub Pages a cada push (ver docs/COMO-PUBLICAR.md).

backend/Dockerfile   Imagem usada pelo Cloud Run (ver
firebase.json        docs/COMO-PUBLICAR-GOOGLE-CLOUD.md). Só entram em
                      jogo se você escolher publicar no Google Cloud.
```

## Documentação

Este README cobre só a visão geral. Para arquitetura, convenções de
código, como adicionar uma tela/campo/filtro novo, e o roadmap de
melhorias futuras, veja [`docs/README.md`](docs/README.md).

## Estado do código

- **Frontend**: exige login real (Firebase Authentication) e o backend
  configurado — não existe mais modo offline/demonstração. Abrir
  `frontend/index.html` sem um backend acessível mostra erro de conexão
  na tela de login, em vez de cair em dados fictícios.
- **Backend**: todos os recursos têm CRUD completo — ver
  `backend/README.md` → "Módulos implementados". Já conectado a um
  projeto Firebase de produção (`kronosop-prod`) e publicado no Render —
  ver "Site no ar" acima para o status atual.
- **Login**: e-mail/senha via Firebase Authentication — não existe mais
  senha em texto plano em nenhuma coleção do Firestore. Toda rota da API
  exige um token válido, e cada mutação tem autorização por `role`
  (supervisor só mexe na própria equipe, etc.). Ver `backend/README.md`
  → "Autenticação".
- **Segurança do Firestore**: `firestore.rules` publicado (leitura
  autenticada, escrita só via backend) — ver `docs/ROADMAP.md`, item 5.
  Ambiente de produção separado do de desenvolvimento (dois projetos
  Firebase distintos) — ver `docs/ROADMAP.md`, item 6.
