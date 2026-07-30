# KronoOP — Backend

API em Node.js + Express, com Firebase (Firestore + Auth) como banco — ver
[`../db/README.md`](../db/README.md) e
[`../docs/FIREBASE-SETUP.md`](../docs/FIREBASE-SETUP.md). Todos os
recursos têm CRUD próprio (ver "Módulos implementados" abaixo) e toda rota
(exceto `/health`) exige um Firebase ID token válido — ver "Autenticação"
abaixo.

**Para produção**: hospede este backend no Render (ou serviço equivalente
que rode Node.js), com Auto-Deploy a cada push. Passo a passo completo
(variáveis de ambiente, root directory, build/start commands) em
[`../docs/COMO-PUBLICAR.md`](../docs/COMO-PUBLICAR.md) → "Passo 5".

## Rodando

```
cd backend
npm install
copy .env.example .env
npm run dev
```

## Estrutura

```
src/
  server.js             # bootstrap do Express
  routes/               # define os endpoints (/api/...)
  controllers/           # lógica de cada endpoint
  middleware/
    auth.js              # exige e valida o Firebase ID token
  services/
    firestoreService.js  # única camada que deve falar com o Firestore
    authz.js              # quem pode fazer o quê (ver "Autenticação" abaixo)
  config/
    env.js               # leitura de variáveis de ambiente
```

## Módulos implementados

Todos os recursos abaixo têm CRUD completo (`GET` com filtros por query
string, `POST`, `PATCH` quando o recurso é editável, `DELETE`), seguindo o
mesmo padrão em `src/controllers/<recurso>.controller.js` +
`src/routes/<recurso>.routes.js`, sempre passando por
`firestoreService.js`. Formato de cada documento:
[`../db/README.md`](../db/README.md) → "Coleções".

| Recurso | Endpoint | Filtros de `GET` | Observações |
|---|---|---|---|
| `users` | `/api/users` | `role`, `supervisorId`, `coordenadorId` | |
| `lembretes` | `/api/lembretes` | `analistaId`, `supervisorId` | Espelha `getLembretesForAnalista()` do frontend |
| `baseMestra` | `/api/base-mestra` | `analistaId` | |
| `ausencias` | `/api/ausencias` | `analistaId` | |
| `suplencias` | `/api/suplencias` | `analistaOriginalId` | |
| `raioX` | `/api/raio-x` | `analistaId`, `inicio`, `fim` | Sem `PATCH` — finalização é imutável; valida estrelas (1–5) e observação (≥150 caracteres) no `POST` |
| `recados` | `/api/recados` | `to` | `PATCH` aceita `marcarLido` (adiciona um id a `lidoPor` sem duplicar) |
| `reunioes` | `/api/reunioes` | `supervisorId` | |
| `plantoes` | `/api/plantoes` | `supervisorAusenteId` | Sem `PATCH` |

## Popular dados de demonstração

`scripts/seed-firestore.js` recria todas as coleções acima com o mesmo
dataset de demonstração do `seedDB()` do frontend, usando IDs fixos para
manter as referências entre coleções
(ex.: `ausencias.baseMestraId` → `baseMestra` de verdade). Rodar quando
quiser resetar os dados de demonstração no Firestore:
```
cd backend
node scripts/seed-firestore.js
```

## Autenticação

Login via **Firebase Authentication** (e-mail/senha) — não existe mais
campo `pass` em texto plano em nenhuma coleção. O papel do usuário
(`analista` / `supervisor` / `coordenador`) fica salvo no documento
`users/{uid}` do Firestore, usando o mesmo `uid` do Auth como ID do
documento.

Toda rota `/api/*` (exceto `/health`) passa por
`src/middleware/auth.js`, que exige um header
`Authorization: Bearer <Firebase ID token>` válido — sem token ou com
token inválido/expirado, responde `401`.

Esse middleware só confere que o token é válido — quem decide **o que**
aquele usuário pode fazer é `src/services/authz.js` (`getCaller`,
`supervisorIdDoAnalista`), usado em todo controller de mutação. As regras
espelham exatamente o que a UI hoje permite — em resumo, supervisor só
mexe na própria equipe e coordenador só mexe nos próprios supervisores:

- `users` — `POST`: supervisor só cria `analista` com `supervisorId`
  igual ao próprio uid; coordenador só cria `supervisor` com
  `coordenadorId` igual ao próprio uid (não existe fluxo para criar
  `coordenador`). `PATCH`: o próprio usuário só pode alterar `navConfig`;
  supervisor edita analistas da própria equipe; coordenador edita
  supervisores da própria equipe. `DELETE`: só supervisor excluindo
  analista da própria equipe.
- `baseMestra` / `ausencias` / `suplencias` — `POST`/`PATCH`/`DELETE`: só
  o supervisor do analista referenciado (`analistaId` ou
  `analistaOriginalId`), resolvido via `supervisorIdDoAnalista`.
- `raioX` — `POST`/`DELETE`: `analistaId` tem que ser o uid de quem está
  chamando — finalização é sempre auto-declarada, nunca em nome de outro
  analista.
- `recados` — `POST`: só supervisor, e só `to: "all_ana_<próprio uid>"`
  (não dá pra mandar em nome de outra equipe). `PATCH`/`DELETE`: marcar
  como lido (`marcarLido`) é aberto a qualquer autenticado; reescrever
  conteúdo ou excluir é só de quem enviou.
- `reunioes` — `POST`: só supervisor, `supervisorId` tem que ser o
  próprio uid.
- `plantoes` — `POST`: só supervisor, `supervisorAusenteId` tem que ser o
  próprio uid.
- `lembretes` — `POST`: `origem:"self"` exige `analistaId` igual ao
  próprio uid; `origem:"supervisor"` exige que o `target` seja a própria
  equipe do supervisor. `PATCH`: dono (self) edita livre; destinatário de
  um lembrete de supervisor só pode marcar/desmarcar `done`, não
  reescrever. `DELETE`: dono exclui o próprio; supervisor exclui o que
  ele mesmo enviou pra própria equipe.

O que não está nessa lista — todo `GET` (lista/detalhe) de qualquer
recurso — continua exigindo só um token válido, sem checagem de papel: não
há isolamento de leitura por equipe hoje (ver `../docs/ROADMAP.md`, item 5).

Criar/editar/excluir usuário (`POST`/`PATCH`/`DELETE /api/users`) também
gerencia a conta correspondente no Firebase Auth (cria com
`admin.auth().createUser`, o `uid` retornado vira o ID do documento
Firestore; `DELETE` remove os dois lados). `GET /api/users/me` retorna o
perfil de quem está autenticado — é o que o frontend usa logo após o
login para saber `role`/`name`/etc.
