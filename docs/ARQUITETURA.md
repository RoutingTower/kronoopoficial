# Arquitetura

## Visão geral

Depois de publicado (ver [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) ou a
alternativa [`COMO-PUBLICAR-GOOGLE-CLOUD.md`](COMO-PUBLICAR-GOOGLE-CLOUD.md)):
```
GitHub Pages (frontend)      --fetch-->  Render (backend/Express)     --firebase-admin-->  Firestore (seu projeto Firebase)
   — ou, no Google Cloud —
Firebase Hosting (frontend)  --fetch-->  Cloud Run (backend/Express)  --firebase-admin-->  Firestore (mesmo projeto Firebase)
```

Em desenvolvimento local:
```
frontend/index.html (file:// ou servidor estático)  --fetch-->  localhost:3001 (backend local)  --firebase-admin-->  Firestore (seu projeto Firebase)
```

Passo a passo de cada peça (contas necessárias, variáveis de ambiente,
como redeployar): [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md).

- **Frontend**: HTML + CSS + JS puro, sem framework, sem bundler, sem
  `node_modules`. Abre direto no navegador (`file://`) ou servido por
  qualquer servidor estático — em produção, publicado no GitHub Pages
  (via GitHub Actions) ou no Firebase Hosting. Ver [`FRONTEND.md`](FRONTEND.md)
  para o mapa de módulos.
- **Backend**: API Node.js + Express. Todos os recursos têm CRUD completo
  — ver [`../backend/README.md`](../backend/README.md) → "Módulos
  implementados". Em produção, hospedado no Render ou no Cloud Run
  (`backend/Dockerfile` já pronto para este último).
- **Banco**: Firebase (Firestore + Auth) — provisionado seguindo
  [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md). Populado com dados de
  demonstração via `backend/scripts/seed-firestore.js`. **Se você rodar o
  backend localmente e em produção ao mesmo tempo apontando pro mesmo
  projeto Firebase, os dois vão ler/escrever no mesmo banco** — considere
  projetos separados para dev e produção.

## Como o frontend persiste dados hoje

O frontend guarda o "banco inteiro" numa variável global (`DB`, definida em
`frontend/js/state.js`), mas cada entidade (`users`, `lembretes`,
`baseMestra`, `ausencias`, `suplencias`, `raioX`, `recados`, `reunioes`,
`plantoes`) tem seu próprio endpoint REST no backend — ver "Módulos
implementados" em [`../backend/README.md`](../backend/README.md). `loadDB()`
busca todos os recursos em paralelo e monta `DB` com o resultado; toda
mutação chama o helper `apiCreateX`/`apiUpdateX`/`apiDeleteX`
correspondente em `frontend/js/state.js` (todos por cima de `apiRequest()`,
que já anexa o Firebase ID token e trata erro).

Existiu um "blob genérico" (`GET/PUT /api/state`, documento
`state/main`) usado como atalho enquanto o backend não tinha CRUD por
recurso — **foi removido** depois que o último recurso migrou (ver
[`ROADMAP.md`](ROADMAP.md), item 4). Se você ver alguma referência a ele
em código ou histórico, é vestígio dessa fase; a rota não existe mais.

**Modo demonstração** (tela de login → "Usar modo demonstração") é a
exceção deliberada: nunca chama nenhum endpoint, usa só `seedDB()` local.
Toda mutação no frontend checa `session.demoMode` primeiro — ver o padrão
repetido em `frontend/js/events.js`.

**Implicação prática**: ao adicionar um campo novo em qualquer entidade,
ele precisa existir tanto no controller do recurso (`backend/src/controllers/`)
quanto no ponto do frontend que monta o objeto antes de mandar pro
`apiCreateX`/`apiUpdateX` — não tem mais um "PUT genérico" pra cobrir isso
automaticamente.

## Camada de acesso ao Firestore

`backend/src/services/firestoreService.js` é a **única** camada que importa
`firebase-admin`. Isso é proposital (documentado no próprio arquivo): se um
dia o banco mudar, só esse serviço muda. Nenhum controller deve importar
`firebase-admin` diretamente.

## Histórico: por que o frontend virou vários arquivos

Até uma sessão atrás, todo o frontend vivia num único arquivo
`frontend/KronoOP.dc.html` — um formato de artifact ("Design Component") que
dependia de um runtime pesado (`support.js`, ~70 KB, carregava React/Babel
via CDN) só para reproduzir o que já era HTML/JS vanilla direto. Como o
projeto estava migrando de protótipo para produto, esse arquivo foi
dividido nas convenções padrão (`index.html` + `css/` + `js/`) e o runtime
foi removido — ver [`FRONTEND.md`](FRONTEND.md) para o resultado. Não deve
existir mais nenhum arquivo `.dc.html` ou `support.js` no projeto; se
aparecer um, é lixo de uma cópia antiga, não um artefato ativo.
