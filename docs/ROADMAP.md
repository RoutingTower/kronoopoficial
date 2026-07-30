# Roadmap

O que falta para o KronoOP sair de protótipo e virar produto, em ordem
sugerida. Cada item referencia onde ele é detalhado.

## 1. Provisionar o Firebase

Criar o projeto Firebase, Firestore e Authentication, e conectar o
backend a ele. Guia completo, com troubleshooting: [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md)
ou o passo a passo resumido em [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) → "Passo 2".

## ✅ 2. Implementar os controllers do backend — feito

Todos os recursos (`users`, `lembretes`, `baseMestra`, `ausencias`,
`suplencias`, `raioX`, `recados`, `reunioes`, `plantoes`) têm CRUD
completo, seguindo o mesmo padrão — ver
[`../backend/README.md`](../backend/README.md) → "Módulos implementados".
As coleções são populadas com o dataset de demonstração via
`backend/scripts/seed-firestore.js`.

## 2.5. Deploy em produção

Frontend no GitHub Pages, backend no Render (ou serviço equivalente), os
dois redeployando automaticamente a cada push. Passo a passo completo:
[`COMO-PUBLICAR.md`](COMO-PUBLICAR.md). Alternativa 100% Google Cloud
(Firebase Hosting + Cloud Run, sem o "sono" do plano free do Render):
[`COMO-PUBLICAR-GOOGLE-CLOUD.md`](COMO-PUBLICAR-GOOGLE-CLOUD.md).

## ✅ 3. Login de verdade (Firebase Authentication) — feito

Login por e-mail/senha via Firebase Auth (SDK client-side, `frontend/js/firebase-init.js`).
`uid` do Auth é o ID do documento em `users/{uid}`; o campo `pass` foi
removido do Firestore e do blob `state/main`. Toda rota `/api/*` (exceto
`/health`) exige um Firebase ID token válido (`backend/src/middleware/auth.js`).
Criar/editar/excluir usuário (Cadastros) passa por `POST/PATCH/DELETE
/api/users`, que também gerencia a conta no Auth — nunca mais grava senha
em texto plano. Um "modo demonstração" opcional na tela de login preserva
o uso 100% offline (sem Firebase, sem backend) para quem só quer testar o
protótipo — ver `frontend/js/ui.js` → `initDemoLogin()`.

## ✅ 3.5. Autorização por role na API — feito

`backend/src/services/authz.js` + checagens em **todos** os controllers de
mutação (`users`, `raioX`, `baseMestra`, `ausencias`, `suplencias`,
`recados`, `reunioes`, `plantoes`, `lembretes`): supervisor só
cria/edita/exclui dado da própria equipe, coordenador só
cria/edita supervisor da própria equipe, cada um só edita a própria
`navConfig`, finalização de raio-x só em nome de quem está autenticado, e
lembrete de equipe só o destinatário pode marcar como concluído (não
reescrever). Antes disso, qualquer usuário autenticado (inclusive um
analista) podia chamar qualquer endpoint de mutação — ver
[`../backend/README.md`](../backend/README.md) → "Autenticação" para a
lista completa das regras.

**Falta**: os `GET` (lista/detalhe) de qualquer recurso continuam abertos a
qualquer usuário autenticado — não há isolamento de leitura por equipe
(ver item 5).

## ✅ 4. Migrar o frontend do blob genérico para os endpoints por recurso — feito

Todos os recursos (`users`, `lembretes`, `raioX`, `baseMestra`,
`ausencias`, `suplencias`, `recados`, `reunioes`, `plantoes`) usam seu
endpoint próprio — `loadDB()` busca todos em paralelo, e cada mutação
chama o `apiCreateX`/`apiUpdateX`/`apiDeleteX` correspondente em
`frontend/js/state.js`. O blob genérico (`GET/PUT /api/state`, coleção
`state`) foi **removido** (rota, controller e a escrita em
`seed-firestore.js`) — não existe mais. Ver
[`ARQUITETURA.md`](ARQUITETURA.md) → "Como o frontend persiste dados
hoje".

## ✅ 5. Firestore Security Rules — feito

`firestore.rules` (raiz do projeto), publicado nos dois projetos Firebase
(dev e produção — ver item 6) via `backend/scripts/deploy-firestore-rules.js`.
Política: leitura liberada pra qualquer usuário autenticado (espelha o que
a API já fazia — ver item 3.5); escrita sempre negada, porque toda escrita
real passa pelo backend (Admin SDK, que ignora as rules e aplica a
autorização por role de verdade via `authz.js`). Testado direto contra o
Firestore (sem passar pelo backend): leitura sem token → `403`; leitura
com token → `200`; escrita com token → `403`. Contexto adicional:
[`../db/README.md`](../db/README.md) → "Regras de segurança".

Como as rules não têm CLI autenticado disponível neste ambiente pra fazer
`firebase deploy`, `deploy-firestore-rules.js` publica direto via Firebase
Rules API, usando a mesma service account do backend (funciona porque ela
já tem permissão de Editor no projeto). Rodar de novo sempre que
`firestore.rules` mudar:
```powershell
cd backend
node scripts/deploy-firestore-rules.js                      # projeto de dev (.env)
$env:ENV_FILE=".env.production"; node scripts/deploy-firestore-rules.js  # produção
```

## ✅ 6. Separar o ambiente de produção do de desenvolvimento — feito

Dois projetos Firebase separados: `kronosop-f552e` (dev, usado no dia a
dia local) e `kronosop-prod` (produção, provisionado do mesmo jeito —
Firestore, Auth, os 7 usuários de demonstração, Security Rules). Cada um
tem seu próprio arquivo de credenciais do backend (`backend/.env` vs
`backend/.env.production`, este último **não commitado** — só o
`.env.production.example`) e sua própria `firebaseConfig` no frontend
(`frontend/js/config.js` escolhe `firebaseConfigDev`/`firebaseConfigProd`
automaticamente com o mesmo `isLocalDev` que já decidia o `API_BASE`).

Pra rodar um script (seed, deploy de rules) contra produção sem alterar o
`.env` do dia a dia, aponte `ENV_FILE`:
```powershell
$env:ENV_FILE=".env.production"; node scripts/seed-firestore.js
```
Testado ponta a ponta contra `kronosop-prod`: login real, `GET
/api/users/me`, `GET /api/base-mestra` — tudo através de uma instância do
backend apontando pras credenciais de produção.

**Continua valendo**: quando publicar de verdade (item 2.5), configure o
Cloud Run/Render com as variáveis de `.env.production` (não as de dev) —
ver [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) / [`COMO-PUBLICAR-GOOGLE-CLOUD.md`](COMO-PUBLICAR-GOOGLE-CLOUD.md).

## Sem data definida / nice-to-have

- Testes automatizados (hoje a validação é 100% manual — ver
  [`GUIA-DE-CONTRIBUICAO.md`](GUIA-DE-CONTRIBUICAO.md) → "Testar uma
  mudança").
- Cascata de exclusão: hoje excluir um analista (Cadastros) não limpa
  suas `baseMestra`/`ausencias`/`lembretes` associadas — elas ficam
  órfãs (o código já é defensivo quanto a isso, `userById(x)?.name||'—'`,
  mas os registros continuam ocupando espaço). Vale implementar tanto no
  controller de `users` (DELETE em cascata) quanto no frontend.
- Domínio próprio / upgrade do Render (remover o cold-start do plano
  free) — ver [`COMO-PUBLICAR.md`](COMO-PUBLICAR.md) → "Passo 5". Ou
  migrar o backend para Cloud Run, que tem cold-start bem mais curto —
  ver [`COMO-PUBLICAR-GOOGLE-CLOUD.md`](COMO-PUBLICAR-GOOGLE-CLOUD.md).
