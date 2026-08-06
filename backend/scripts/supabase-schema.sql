-- Schema do KronoOP no Supabase (Postgres) — desenho completo em
-- docs/MIGRACAO-SUPABASE.md, este arquivo é a versão executável (colar no
-- SQL Editor do projeto Supabase, ou "supabase db execute").
--
-- Ordem importa por causa das FKs: users -> base_mestra -> as demais.
-- RLS fica desligado de propósito: a autorização já vive em código
-- (backend/src/services/authz.js), o backend acessa com a service_role
-- key (que ignora RLS), igual a service account do Firebase ignorava as
-- regras do Firestore. Ver docs/MIGRACAO-SUPABASE.md → "RLS".

create extension if not exists pgcrypto;

create table users (
  id              uuid primary key,
  role            text not null check (role in ('analista','supervisor','coordenador')),
  name            text not null,
  email           text not null unique,
  active          boolean not null default true,
  -- ignora TODAS as checagens de "só a própria equipe" em todo controller
  -- (ver backend/src/services/authz.js) — sem essa coluna a conta admin
  -- vira um coordenador comum.
  is_admin        boolean not null default false,
  supervisor_id   uuid references users(id) on delete set null,
  coordenador_id  uuid references users(id) on delete set null,
  jornada         jsonb,
  nav_config      jsonb
);
create index idx_users_supervisor on users(supervisor_id);
create index idx_users_coordenador on users(coordenador_id);
create index idx_users_role on users(role);

create table base_mestra (
  id            uuid primary key default gen_random_uuid(),
  -- nullable de propósito: existem escalas reais cujo "titular" nunca teve
  -- conta de login (analistaId órfão no Firestore) — o frontend já exibe o
  -- nome via "titular", sem depender do id resolver. Ver
  -- docs/MIGRACAO-SUPABASE.md → "Ajustes encontrados no dia".
  analista_id   uuid references users(id),
  operacao      text not null,
  ciclo         text not null default 'T3',
  hora_inicio   text not null,
  hora_fim      text not null,
  titular       text not null default '',
  data_inicio   date not null,
  data_fim      date not null,
  dias          text[] not null default '{}'
);
create index idx_basemestra_analista on base_mestra(analista_id);

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

create table feedbacks (
  id             uuid primary key default gen_random_uuid(),
  analista_id    uuid not null references users(id),
  analista_nome  text not null,
  texto          text not null,
  ts             bigint not null
);

create table lembretes (
  id            uuid primary key default gen_random_uuid(),
  origem        text not null check (origem in ('self','supervisor')),
  texto         text not null,
  observacoes   text not null default '',
  analista_id   uuid references users(id),
  target        text,
  criado_por    text not null default '',
  done          boolean not null default false,
  ts            bigint not null,
  data          date not null,
  hora          text not null default ''
);
create index idx_lembretes_analista on lembretes(analista_id);
create index idx_lembretes_target on lembretes(target);

create table plantoes (
  id                     uuid primary key default gen_random_uuid(),
  supervisor_ausente_id  uuid not null references users(id),
  data                   date not null,
  cobertura_role         text not null,
  cobertura_nome         text not null
);
create index idx_plantoes_supervisor on plantoes(supervisor_ausente_id);

-- Nota de "particularidades" por Operação — uma por Operação+Supervisor,
-- editável por qualquer analista da equipe. Pensada pra passagem de bastão
-- entre turnos ("Ver Particularidade" no card da operação, ver
-- render-analista.js). Sem histórico de versões de propósito: é uma nota
-- viva compartilhada, não um log — atualizado_por/atualizado_em só guardam
-- a ÚLTIMA edição.
create table particularidades (
  id              uuid primary key default gen_random_uuid(),
  supervisor_id   uuid not null references users(id),
  operacao        text not null,
  texto           text not null default '',
  atualizado_por  text not null default '',
  atualizado_em   bigint not null default 0
);
create unique index idx_particularidades_sup_op on particularidades(supervisor_id, operacao);

create table raio_x (
  id            uuid primary key default gen_random_uuid(),
  -- nullable pelo mesmo motivo de base_mestra.analista_id acima.
  analista_id   uuid references users(id),
  operacao      text not null,
  hora          text not null,
  data          date not null,
  estrelas      smallint not null check (estrelas between 1 and 5),
  -- sem "check (char_length >= 150)" de propósito: a regra do
  -- MIN_OBSERVACAO_LEN (backend/src/controllers/raioX.controller.js) só
  -- vale para registros NOVOS, criados via API. Tem dado real anterior a
  -- essa validação existir com observação mais curta — mesma situação já
  -- documentada para base_mestra.dias (compatibilidade com registros
  -- antigos). Reforçar isso no banco quebraria a migração desses registros.
  observacao    text not null,
  -- SPR roteirizado (real) no fechamento da operação, e o SPR meta vigente
  -- na hora (cópia congelada de sprs.spr — ver getSPR() no frontend — pra
  -- não perder o histórico se a meta mudar depois). spr_meta fica null
  -- quando não havia meta cadastrada pra essa operação+ciclo no momento.
  spr_roteirizado numeric not null,
  spr_meta        numeric,
  sem_roteirizacao boolean not null default false,
  ts            bigint not null
);
create index idx_raiox_analista on raio_x(analista_id);
create index idx_raiox_data on raio_x(data);

create table recados (
  id            uuid primary key default gen_random_uuid(),
  remetente     text not null,
  destino       text not null,
  titulo        text not null default '',
  texto         text not null,
  observacoes   text not null default '',
  ts            bigint not null,
  lido_por      text[] not null default '{}',
  editado       boolean not null default false
);
create index idx_recados_destino on recados(destino);

create table reunioes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('grupo','individual')),
  titulo         text not null default 'Reunião',
  data           date not null,
  hora           text not null,
  hora_fim       text not null default '',
  analista_ids   uuid[] not null default '{}',
  supervisor_id  uuid not null references users(id),
  criado_por     text not null default '',
  link           text not null default ''
);
create index idx_reunioes_supervisor on reunioes(supervisor_id);

create table sprs (
  id             uuid primary key default gen_random_uuid(),
  supervisor_id  uuid not null references users(id),
  operacao       text not null,
  ciclo          text not null,
  spr            numeric not null
);
create index idx_sprs_supervisor on sprs(supervisor_id);

create table suplencias (
  id                    uuid primary key default gen_random_uuid(),
  operacao              text not null,
  ciclo                 text not null default 'T3',
  hora_inicio           text not null,
  hora_fim              text not null,
  suplente              text not null,
  data_cobertura        date not null,
  analista_original_id  uuid not null references users(id)
);
create index idx_suplencias_analista_original on suplencias(analista_original_id);

-- Notificações internas — hoje só usado por "Esqueci minha senha" (login
-- avisa o supervisor/coordenador/admin da pessoa, ver
-- backend/src/controllers/notificacoes.controller.js), desenhado genérico
-- o bastante pra outros tipos de aviso no futuro (campo "tipo").
create table notificacoes (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references users(id),
  tipo            text not null default 'esqueci_senha',
  mensagem        text not null,
  lida            boolean not null default false,
  ts              bigint not null
);
create index idx_notificacoes_destinatario on notificacoes(destinatario_id);
