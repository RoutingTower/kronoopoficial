# Migração Firebase → Supabase

Desenho completo da migração de Firestore+Firebase Auth para Supabase
(Postgres + Auth). Ver a discussão que originou isso em
[ARQUITETURA.md](ARQUITETURA.md) → "Camada de acesso ao Firestore" (o
motivo de `firestoreService.js` ser a única porta de entrada é justamente
permitir essa troca sem reescrever os controllers).

## Status

**Dev já migrado e cortado para o Supabase** (projeto `kronoop-dev`):
backend e frontend locais já rodam sobre o Supabase (Postgres + Auth), com
os 8 usuários e todos os dados reais copiados do Firestore. Testado via API
(login real + os 11 recursos + `/users/me`, todos 200) e via UI no navegador
(login real, telas carregando normalmente). `firestoreService.js` continua
no repo (não apagado ainda, ver item 18), mas nenhum controller mais o usa.

**Produção continua 100% no Firebase** — nada dos itens 14–18 foi feito.

- [`backend/scripts/supabase-schema.sql`](../backend/scripts/supabase-schema.sql) — DDL das 11 tabelas, já rodado (+ ajustes) no projeto dev.
- [`backend/src/services/supabaseService.js`](../backend/src/services/supabaseService.js) — em uso por todos os controllers + `auth.js` + `authz.js`.
- [`backend/scripts/migrate-to-supabase.js`](../backend/scripts/migrate-to-supabase.js) — já rodado contra dev.
- [`frontend/js/supabase-init.js`](../frontend/js/supabase-init.js) — incluído em `index.html`, substituindo `firebase-init.js`.
- Config: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` preenchidos no `.env` local; `supabaseConfigDev` preenchido em [config.js](../frontend/js/config.js). `supabaseConfigProd` continua vazio.

**Falta — depende de criar o projeto Supabase de produção**: ver itens 14–18 do checklist abaixo.

## Por que Supabase

Resolve as duas dependências do Firebase de uma vez só: Firestore (banco) e
Firebase Auth (autenticação). Ver conversa que originou esta escolha — as
alternativas descartadas foram Turso/libSQL (banco ótimo, mas sem Auth
embutido — exigiria montar autenticação à parte) e MongoDB Atlas (banco
parecido com Firestore, mesmo problema de Auth órfão).

## As 11 coleções → 11 tabelas

Mapeamento 1:1 com as coleções do Firestore hoje (nomes de campo em
`snake_case`, convenção Postgres; o de-para fica a cargo da nova camada de
serviço, não dos controllers).

### `users`
Fonte: [users.controller.js](../backend/src/controllers/users.controller.js)

```sql
create table users (
  id              uuid primary key,  -- = auth.users.id do Supabase Auth
  role            text not null check (role in ('analista','supervisor','coordenador')),
  name            text not null,
  email           text not null unique,
  active          boolean not null default true,
  is_admin        boolean not null default false,  -- ignora toda checagem de equipe, ver authz.js
  supervisor_id   uuid references users(id) on delete set null,
  coordenador_id  uuid references users(id) on delete set null,
  jornada         jsonb,   -- { dias: text[], horaInicio: text, horaFim: text }
  nav_config      jsonb
);
create index idx_users_supervisor on users(supervisor_id);
create index idx_users_coordenador on users(coordenador_id);
create index idx_users_role on users(role);
```

### `ausencias`
Fonte: [ausencias.controller.js](../backend/src/controllers/ausencias.controller.js)

```sql
create table ausencias (
  id                uuid primary key default gen_random_uuid(),
  analista_id       uuid not null references users(id),
  base_mestra_id    uuid not null references base_mestra(id),
  operacao          text not null,
  ciclo             text not null default '',
  hora_inicio       text not null default '',
  hora_fim          text not null default '',
  data              date not null,
  tipo              text not null check (tipo in ('folga','ferias')),
  suplente_id       uuid references users(id),
  suplente_nome     text not null default ''
);
create index idx_ausencias_analista on ausencias(analista_id);
```
Depende de `base_mestra` já existir — criar essa tabela antes.

### `base_mestra`
Fonte: [baseMestra.controller.js](../backend/src/controllers/baseMestra.controller.js)

```sql
create table base_mestra (
  id            uuid primary key default gen_random_uuid(),
  analista_id   uuid references users(id),  -- nullable, ver "Ajustes encontrados no dia"
  operacao      text not null,
  ciclo         text not null default 'T3',
  hora_inicio   text not null,
  hora_fim      text not null,
  titular       text not null default '',
  data_inicio   date not null,
  data_fim      date not null,
  dias          text[] not null default '{}'  -- vazio = roda todo dia (ver bmRodaNoDia() no frontend)
);
create index idx_basemestra_analista on base_mestra(analista_id);
```

### `feedbacks`
Fonte: [feedbacks.controller.js](../backend/src/controllers/feedbacks.controller.js)

```sql
create table feedbacks (
  id             uuid primary key default gen_random_uuid(),
  analista_id    uuid not null references users(id),
  analista_nome  text not null,  -- cópia desnormalizada, mesmo comportamento de hoje
  texto          text not null,
  ts             bigint not null  -- epoch ms (Date.now()), mantido igual ao frontend
);
```

### `lembretes`
Fonte: [lembretes.controller.js](../backend/src/controllers/lembretes.controller.js)

```sql
create table lembretes (
  id            uuid primary key default gen_random_uuid(),
  origem        text not null check (origem in ('self','supervisor')),
  texto         text not null,
  observacoes   text not null default '',
  analista_id   uuid references users(id),
  target        text,  -- uid de analista OU 'all_ana_<supervisorId>' — não é FK estrita
  criado_por    text not null default '',
  done          boolean not null default false,
  ts            bigint not null,
  data          date not null,
  hora          text not null default ''
);
create index idx_lembretes_analista on lembretes(analista_id);
create index idx_lembretes_target on lembretes(target);
```

### `plantoes`
Fonte: [plantoes.controller.js](../backend/src/controllers/plantoes.controller.js)

```sql
create table plantoes (
  id                     uuid primary key default gen_random_uuid(),
  supervisor_ausente_id  uuid not null references users(id),
  data                   date not null,
  cobertura_role         text not null,
  cobertura_nome         text not null
);
create index idx_plantoes_supervisor on plantoes(supervisor_ausente_id);
```

### `raio_x`
Fonte: [raioX.controller.js](../backend/src/controllers/raioX.controller.js)

```sql
create table raio_x (
  id            uuid primary key default gen_random_uuid(),
  analista_id   uuid references users(id),  -- nullable, ver "Ajustes encontrados no dia"
  operacao      text not null,
  hora          text not null,
  data          date not null,
  estrelas      smallint not null check (estrelas between 1 and 5),
  observacao    text not null,  -- sem check(char_length>=150): tem dado real anterior a essa validação existir na API — regra só vale pra registros novos
  ts            bigint not null
);
create index idx_raiox_analista on raio_x(analista_id);
create index idx_raiox_data on raio_x(data);  -- filtro por range (inicio/fim) na listagem
```

### `recados`
Fonte: [recados.controller.js](../backend/src/controllers/recados.controller.js)

```sql
create table recados (
  id            uuid primary key default gen_random_uuid(),
  remetente     text not null,  -- era "from": string de exibição (ex.: "João (Supervisor)"), não FK
  destino       text not null,  -- era "to": uid de analista OU 'all_ana_<supervisorId>'
  titulo        text not null default '',
  texto         text not null,
  observacoes   text not null default '',
  ts            bigint not null,
  lido_por      text[] not null default '{}',
  editado       boolean not null default false
);
create index idx_recados_destino on recados(destino);
```
`from`/`to` viram `remetente`/`destino` porque `from` é problemático como
nome de coluna em algumas ferramentas SQL — a nova camada de serviço faz o
de-para na resposta da API pro frontend continuar recebendo `from`/`to`.

### `reunioes`
Fonte: [reunioes.controller.js](../backend/src/controllers/reunioes.controller.js)

```sql
create table reunioes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('grupo','individual')),
  titulo         text not null default 'Reunião',
  data           date not null,
  hora           text not null,
  analista_ids   uuid[] not null default '{}',
  supervisor_id  uuid not null references users(id),
  criado_por     text not null default ''
);
create index idx_reunioes_supervisor on reunioes(supervisor_id);
```

### `sprs`
Fonte: [sprs.controller.js](../backend/src/controllers/sprs.controller.js)

```sql
create table sprs (
  id             uuid primary key default gen_random_uuid(),
  supervisor_id  uuid not null references users(id),
  operacao       text not null,
  ciclo          text not null,
  spr            numeric not null
);
create index idx_sprs_supervisor on sprs(supervisor_id);
```

### `suplencias`
Fonte: [suplencias.controller.js](../backend/src/controllers/suplencias.controller.js)

```sql
create table suplencias (
  id                    uuid primary key default gen_random_uuid(),
  operacao              text not null,
  ciclo                 text not null default 'T3',
  hora_inicio           text not null,
  hora_fim              text not null,
  suplente              text not null,  -- nome, não FK (diferente de ausencias.suplente_id)
  data_cobertura        date not null,
  analista_original_id  uuid not null references users(id)
);
create index idx_suplencias_analista_original on suplencias(analista_original_id);
```

Ordem de criação (por causa das FKs): `users` → `base_mestra` → todas as
outras (todas referenciam `users`, só `ausencias` também referencia
`base_mestra`).

## O ponto mais delicado: remapear ids

Os ids do Firestore (ex.: `aB3xK9...`) não são UUIDs válidos, então dá pra
copiar o **conteúdo** de cada documento para a tabela nova, mas não o
**id** — toda tabela acima recebe um `uuid` novo via `gen_random_uuid()`.
Isso quebra qualquer campo que referencia o id de outro documento, então o
script de migração precisa:

1. Migrar `users` primeiro, guardando um dicionário `{ firebaseUid → uuidNovo }`
   (o uuid novo aqui vem do Supabase Auth ao recriar cada conta — ver seção
   seguinte, não é gerado à toa).
2. Migrar `base_mestra`, guardando `{ firestoreDocId → uuidNovo }` (usado no
   passo 3 pela `ausencias`).
3. Migrar as demais tabelas, usando os dois dicionários acima para reescrever
   todo campo `*_id`/`*Id` (`analistaId`, `supervisorId`, `coordenadorId`,
   `suplenteId`, `analistaOriginalId`, `supervisorAusenteId`,
   `baseMestraId`) e também o prefixo sintético `all_ana_<uid>` usado em
   `target`/`destino` (trocar o uid antigo pelo novo nesse texto também).

Sem esse remapeamento, `analista_id`, `supervisor_id` etc. ficam apontando
para uuids que não existem mais.

## Autenticação: recriando os usuários

Firebase Auth não permite exportar senha em texto claro nem hash compatível
com Supabase Auth — não tem como "copiar" a conta, tem que recriar:

- Para cada usuário em `users` (Firestore), chamar
  `supabase.auth.admin.createUser({ email, password: <temporária>, email_confirm: true })`.
- O uuid retornado é o novo `id` — entra no dicionário do passo 1 acima.
- Depois, cada usuário precisa trocar a senha temporária (fluxo de "esqueci
  minha senha" do Supabase Auth, ou avisar cada um manualmente — decidir
  isso no dia da migração, é o único passo que não dá pra deixar 100%
  pronto de antemão porque depende de como avisar os usuários reais).

## RLS (Row Level Security)

Não é necessário ligar. Hoje toda a autorização já vive em código
(`backend/src/services/authz.js` + os `if (!caller.isAdmin...)` em cada
controller) — o backend acessa o Firestore com a service account, que
ignora regras de segurança do Firestore da mesma forma que a
`service_role key` do Supabase ignora RLS. Manter esse modelo (autorização
só no Express, RLS desligado) evita duplicar toda a lógica de
`isSupervisorDaEquipe`/`isDonoDaEquipe` em policies SQL.

## Checklist para o dia da execução

O que já está escrito (código) está marcado [x]; o resto depende de ter um
projeto Supabase real na sua frente — ver "Status" no topo deste documento.

1. [x] Criar projeto no Supabase — `kronoop-dev` (sa-east-1).
2. [x] Rodar [`supabase-schema.sql`](../backend/scripts/supabase-schema.sql) no SQL Editor do projeto (+ 2 ajustes feitos depois, ver "Ajustes encontrados no dia" abaixo).
3. [x] `supabaseService.js` escrito, mesma assinatura de `firestoreService.js`.
4. [x] Preencher `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no `.env` local (backend) e rodar `npm install` em `backend/`.
5. [x] `node scripts/migrate-to-supabase.js --dry-run` — confere contagens sem escrever nada.
6. [x] `node scripts/migrate-to-supabase.js` de verdade — 8 usuários recriados no Auth (senhas temporárias entregues fora deste doc), 11 tabelas copiadas.
7. [x] Trocar `require("./firestoreService")` por `require("./supabaseService")` em: os 11 controllers, [auth.js](../backend/src/middleware/auth.js) e [authz.js](../backend/src/services/authz.js).
8. [x] `scripts/create-admin.js` migrado pro Supabase (require + checagem `err.code !== "user_not_found"`).
9. [x] Testado localmente via API (token real de login, 11 recursos + `/users/me`, todos 200).
10. [x] `supabase-init.js` escrito, mesma interface `KronoAuth` de `firebase-init.js` (+ `onAuthStateChanged`, ver "Ajustes encontrados no dia").
11. [x] `supabaseConfigDev` preenchido em [config.js](../frontend/js/config.js). `supabaseConfigProd` continua vazio — só no dia da migração de produção.
12. [x] Em `index.html`, `<script>` do Firebase (compat) + `firebase-init.js` trocados pelo SDK do Supabase (CDN) + `supabase-init.js`.
13. [x] Testado o frontend local no navegador (login real) contra o backend local (já no Supabase).
14. [x] Repetidos os passos 1–9 para o projeto de **produção** (`kronoop-prod`, ref `simkcmjwfpcljyvcmhjs`) — schema criado, 44 usuários + todos os dados reais migrados, testado via API (login real do admin + os 11 recursos, todos 200). `.env.production` (backend, local) e `supabaseConfigProd` ([config.js](../frontend/js/config.js)) preenchidos.
15. [ ] Trocar env vars em produção: [render.yaml](../render.yaml) já tem `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` como `sync: false` — preencher no painel do Render (só quem tem acesso ao painel consegue).
16. [ ] Deploy do backend (Render) e do frontend (GitHub Pages/Firebase Hosting) — commit + push do que já está pronto localmente.
17. [ ] Confirmar produção funcionando de ponta a ponta (login real de um usuário de verdade, pós-deploy).
18. [ ] Limpeza: remover `firebase-admin` do `package.json`, apagar `firestoreService.js`, `firebase-init.js`, e as env vars `FIREBASE_*` (backend e Render).

## Nota sobre o "gap" de dados entre migração e deploy

A migração acima é uma fotografia do Firestore de produção no momento em
que rodou — o sistema continua em uso (Firestore recebendo escritas reais)
até o deploy do passo 16 acontecer de fato. Qualquer dado gravado no
Firestore DEPOIS da migração e ANTES do deploy não está no Supabase. Quanto
mais rápido os passos 15–16 acontecerem depois da migração, menor essa
janela. Se passar muito tempo (ex.: mais de um dia) entre migrar e fazer o
deploy, vale rodar `ENV_FILE=.env.production node scripts/migrate-to-supabase.js`
de novo antes do deploy — mas ele não é idempotente (recria os 44 usuários
do zero, com senhas novas), então nesse caso avise antes.

## Ajustes encontrados no dia (não estavam previstos neste doc)

- **Coluna `is_admin` faltando**: o schema original não tinha essa coluna em
  `users`, e `migrate-to-supabase.js` não copiava o campo — `caller.isAdmin`
  é checado em praticamente todo controller (`authz.js` e cada
  `*.controller.js`), então isso quebraria autorização pra conta admin
  silenciosamente. Corrigido: coluna adicionada ao schema (`alter table
  users add column is_admin boolean not null default false` já rodado no
  projeto dev) e ao script de migração.
- **Check constraint órfã em `raio_x`**: o projeto dev já tinha uma versão
  anterior do schema aplicada, com `check (char_length(observacao) >= 150)`
  em `raio_x.observacao` — removida do arquivo antes deste doc existir, mas
  nunca removida do banco. Travou a migração real (dado antigo mais curto
  que 150 caracteres). Corrigido no banco (`alter table raio_x drop
  constraint raio_x_observacao_check`).
- **`analista_id` órfão em produção**: 19 `analistaId` distintos usados em
  54 linhas de `baseMestra` (+ 2 de `raioX`) não existem nem no Firestore
  `users` nem no Firebase Auth — são analistas com posição ativa na escala
  (`dataFim` no futuro) mas que nunca tiveram conta de login; o frontend já
  exibe o nome via `titular`/`observacao`, sem depender do id resolver.
  Como o schema exigia `analista_id not null`, a migração real teria
  travado ao chegar nessas linhas (dado real, não é lixo — decisão do
  usuário: manter esse padrão, não criar contas fantasma nem descartar as
  escalas). Corrigido: `analista_id` virou opcional em `base_mestra` e
  `raio_x` — `migrate-to-supabase.js` já gravava `null` como fallback
  quando o id não é encontrado no mapa, só faltava o banco aceitar.
- **`SUPABASE_URL` com `.com` em vez de `.co` no Render**: colada errada
  (autocorreção/digitação) no painel de env vars, causando `fetch failed`
  (`ENOTFOUND`) em toda chamada do backend ao Supabase — o domínio
  `simkcmjwfpcljyvcmhjs.supabase.com` simplesmente não existe. Sintoma
  enganoso: parecia falha de rede/IPv6 (daí o `dns.setDefaultResultOrder`
  em [server.js](../backend/src/server.js), que não fazia mal mas também
  não era a causa). Achado só depois de adicionar um endpoint de
  diagnóstico temporário (`/api/debug-network`, já removido) que testava
  DNS + fetch cru, porque a lib `supabase-js` descarta o erro de rede
  original e só propaga "fetch failed" genérico. Lição: sempre conferir
  o domínio (`.co`, não `.com`) ao colar a Project URL do Supabase em
  qualquer lugar.
- **`main.js` chamava `firebase.auth().onAuthStateChanged(...)` direto**,
  por fora da abstração `KronoAuth` — não coberto por nenhum item deste
  checklist. Se os `<script>` fossem trocados sem isso, o boot da página
  quebraria (`firebase is not defined`). Corrigido: `onAuthStateChanged`
  virou parte da interface `KronoAuth` (implementado nos dois arquivos —
  `firebase-init.js` e `supabase-init.js`), e `main.js` agora chama
  `KronoAuth.onAuthStateChanged(...)`.
