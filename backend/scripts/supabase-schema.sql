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
  nav_config      jsonb,
  -- Só usado quando role='supervisor': até 5 analistas da própria equipe
  -- liberados pra ver a "Programação Analista" (só leitura, ver
  -- render-supervisor.js supProgramacao) enquanto o supervisor estiver de
  -- folga. Array vazio = ninguém delegado. Sem FK (uuid[] não suporta
  -- references no Postgres) — a validação de "é da própria equipe" e do
  -- limite de 5 fica em users.controller.js updateUser.
  delegados_programacao_ids uuid[] not null default '{}'
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

-- Confirmação pessoal de "li a particularidade" numa cobertura específica
-- (analista+operação+data) — diferente da nota em si (particularidades,
-- acima), que é compartilhada: aqui é por pessoa e por instância de
-- cobertura, pra saber quem confirmou ciência de qual turno. Só o próprio
-- analista registra em nome dele (ver particularidadeCiente.controller.js).
create table particularidade_ciente (
  id           uuid primary key default gen_random_uuid(),
  analista_id  uuid not null references users(id),
  operacao     text not null,
  data         date not null,
  ts           bigint not null
);
create unique index idx_particularidade_ciente_unico on particularidade_ciente(analista_id, operacao, data);

create table raio_x (
  id            uuid primary key default gen_random_uuid(),
  -- nullable pelo mesmo motivo de base_mestra.analista_id acima.
  analista_id   uuid references users(id),
  operacao      text not null,
  -- Nulo em registros antigos (o campo veio bem depois, e por um bug o
  -- controller aceitava "ciclo" no corpo da requisição mas nunca gravava —
  -- corrigido junto com a importação da planilha de roteirização, que
  -- precisa dele pra casar a linha certa quando o mesmo hub roda mais de
  -- um ciclo no dia).
  ciclo         text,
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
  -- Tempo de Execução: quanto levou a operação. Nulo até a planilha de
  -- roteirização importada (ver planilhaImport.controller.js) preencher —
  -- não é mais medido por um cronômetro Iniciar/Finalizar dentro do Kronos.
  -- duracao_origem sempre "planilha" hoje; nulo em registros antigos, de
  -- antes dessa importação existir (ou de antes de existir cronômetro,
  -- fase ainda mais antiga do produto).
  duracao_segundos integer,
  duracao_origem    text,
  -- Início/fim reais (HH:MM), só pra exibição — o card da Grade Integrada
  -- mostra "hora_inicio_real–hora_fim_real · duração" quando tem os dois;
  -- a duração em si (duracao_segundos) tem precisão de segundos e não
  -- depende desses campos.
  hora_inicio_real text,
  hora_fim_real    text,
  -- Quantidade de pedidos órfãos na operação — opcional de propósito
  -- (diferente do SPR, não é obrigatório pra fechar o Raio-X): nulo quer
  -- dizer "não informado", não "zero". Quem preenche escolhe explicitamente
  -- marcar "sem órfãos" (grava 0) em vez de deixar em branco.
  orfaos        integer check (orfaos is null or orfaos >= 0),
  ts            bigint not null
);
create index idx_raiox_analista on raio_x(analista_id);
create index idx_raiox_data on raio_x(data);

-- "Iniciado segundo a planilha, ainda sem Raio-X enviado" — a planilha de
-- roteirização (ver planilhaImport.controller.js) sabe o horário de início
-- real de uma operação muito antes do analista abrir o Kronos e mandar o
-- Raio-X (estrelas/observação/SPR). Enquanto não existe Raio-X pra essa
-- operação+data, o card mostra "iniciado às X" com base nesta tabela — assim
-- que o Raio-X é enviado, ele passa a valer (raio_x.hora_inicio_real) e esta
-- linha vira só histórico morto (não é limpa, mas também não é mais lida).
-- analista_id vem do e-mail da própria planilha (coluna nova), casado
-- contra users.email — sem isso não tem como saber de quem é a operação
-- antes de existir um Raio-X (que já vem com analista_id sabido).
create table roteirizacao_status (
  id               uuid primary key default gen_random_uuid(),
  analista_id      uuid not null references users(id),
  operacao         text not null,
  ciclo            text,
  data             date not null,
  hora_inicio_real text,
  hora_fim_real    text,
  duracao_segundos integer,
  atualizado_em    bigint not null
);
create index idx_roteirizacao_status_analista on roteirizacao_status(analista_id);
create index idx_roteirizacao_status_data on roteirizacao_status(data);

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

-- Confirmação de presença numa reunião — sempre o próprio analista
-- marcando em nome dele (ver reuniaoPresenca.controller.js), pra sinalizar
-- pro supervisor quem realmente participou. Um registro por reunião+pessoa.
create table reuniao_presenca (
  id           uuid primary key default gen_random_uuid(),
  reuniao_id   uuid not null references reunioes(id) on delete cascade,
  analista_id  uuid not null references users(id),
  ts           bigint not null
);
create unique index idx_reuniao_presenca_unico on reuniao_presenca(reuniao_id, analista_id);

create table sprs (
  id             uuid primary key default gen_random_uuid(),
  supervisor_id  uuid not null references users(id),
  operacao       text not null,
  ciclo          text not null,
  spr            numeric not null,
  -- Agrupamento maior que UF (ex.: "Sudeste", "Nordeste") — não vem do nome
  -- do hub como a UF (ver ufDaOperacao no frontend). Vive aqui (não em
  -- base_mestra) de propósito: o cadastro de SPR já é 1 linha por
  -- operação+ciclo (sem duplicar por vigência/titular como base_mestra
  -- teria) e já tem carga em massa por Excel — reaproveita os dois pra
  -- Regional. Só usado pra filtrar Resultado SPR (ver regionalDaOperacao,
  -- frontend/js/utils.js); não aparece no card da Programação do analista.
  regional       text
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
  analista_original_id  uuid not null references users(id),
  tipo                  text not null default 'folga'
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

-- Convocações/formulários internos que o supervisor liga/desliga e programa
-- (janela abertura/fechamento) — hoje 4 tipos: domingo_voluntariado (analista
-- marca em quais domingos topa trabalhar), folga_escolha (analista escolhe 1
-- dia de folga compensatória, respeitando limite_por_dia), reconhecimento_mensal
-- (analista indica um colega + motivo) e ferias_solicitacao (analista pede um
-- período, fica "pendente" até o supervisor aprovar/recusar). abertura/
-- fechamento em bigint (epoch ms), mesmo padrão de raio_x.ts e
-- notificacoes.ts — não timestamptz, pra bater com o resto do schema.
create table formularios (
  id              uuid primary key default gen_random_uuid(),
  supervisor_id   uuid not null references users(id),
  tipo            text not null check (tipo in ('domingo_voluntariado','folga_escolha','reconhecimento_mensal','ferias_solicitacao')),
  titulo          text not null default '',
  descricao       text not null default '',
  abertura        bigint not null,
  fechamento      bigint not null,
  ativo_manual    boolean not null default true,
  -- período de referência (ex.: os domingos de setembro; a janela de dias
  -- pra escolher folga) — nulo pra reconhecimento_mensal, que não usa.
  periodo_inicio  date,
  periodo_fim     date,
  -- só usado por folga_escolha (vagas por dia); nulo nos demais tipos.
  limite_por_dia  integer,
  criado_em       bigint not null
);
create index idx_formularios_supervisor on formularios(supervisor_id);

-- Uma resposta por analista por formulário (reenviar substitui a anterior,
-- enquanto a janela estiver aberta) — payload varia por tipo:
--   domingo_voluntariado: { "datas": ["2026-09-06", ...] }
--   folga_escolha:         { "data": "2026-08-19" }
--   reconhecimento_mensal: { "indicadoId": "uuid", "motivo": "texto" }
--   ferias_solicitacao:    { "inicio": "2026-09-10", "fim": "2026-09-20", "justificativa": "texto" }
-- status só é relevante pra ferias_solicitacao (fica "pendente" até o
-- supervisor decidir); nos outros tipos fica sempre "enviado", sem uso.
create table formulario_respostas (
  id              uuid primary key default gen_random_uuid(),
  formulario_id   uuid not null references formularios(id) on delete cascade,
  analista_id     uuid not null references users(id),
  payload         jsonb not null default '{}',
  status          text not null default 'enviado' check (status in ('enviado','pendente','aprovado','recusado')),
  motivo_recusa   text not null default '',
  criado_em       bigint not null,
  atualizado_em   bigint not null,
  -- Só usado em folga_escolha: supervisor marca quando já organizou o
  -- suplente pros dias que o analista escolheu — dispara notificação
  -- avisando que a folga já está na agenda dele (ver confirmarCobertura,
  -- formularioRespostas.controller.js).
  confirmado_pelo_supervisor boolean not null default false,
  confirmado_em   bigint
);
create unique index idx_formresp_unico on formulario_respostas(formulario_id, analista_id);
create index idx_formresp_formulario on formulario_respostas(formulario_id);

-- Quiz ao vivo (estilo Kahoot) — feature independente do resto do sistema:
-- perguntas vivem dentro da própria sessão (sem banco de perguntas
-- reutilizável), e quem participa entra só com PIN + apelido, sem conta no
-- Kronos (por isso quiz_participantes não referencia users). Criador é
-- qualquer usuário logado, não só supervisor/coordenador (ver
-- backend/src/controllers/quiz.controller.js).
create table quiz_sessoes (
  id                    uuid primary key default gen_random_uuid(),
  titulo                text not null,
  pin                   text not null unique,
  criado_por            uuid not null references users(id),
  status                text not null default 'lobby'
                        check (status in ('lobby','pergunta','revelacao','ranking','encerrado')),
  pergunta_atual_index  integer not null default -1,
  pergunta_iniciada_em  bigint,
  criado_em             bigint not null
);
create index idx_quizsessoes_pin on quiz_sessoes(pin);
create index idx_quizsessoes_criador on quiz_sessoes(criado_por);

create table quiz_perguntas (
  id              uuid primary key default gen_random_uuid(),
  quiz_sessao_id  uuid not null references quiz_sessoes(id) on delete cascade,
  ordem           integer not null,
  enunciado       text not null,
  opcoes          text[] not null,
  correta_index   integer not null,
  tempo_segundos  integer not null default 20
);
create index idx_quizperguntas_sessao on quiz_perguntas(quiz_sessao_id);

create table quiz_participantes (
  id              uuid primary key default gen_random_uuid(),
  quiz_sessao_id  uuid not null references quiz_sessoes(id) on delete cascade,
  nome            text not null,
  pontuacao       integer not null default 0,
  entrou_em       bigint not null
);
create index idx_quizparticipantes_sessao on quiz_participantes(quiz_sessao_id);

-- unique (quiz_pergunta_id, participante_id) impede responder a mesma
-- pergunta duas vezes (ver POST /api/quiz-play/:pin/responder).
create table quiz_respostas (
  id               uuid primary key default gen_random_uuid(),
  quiz_pergunta_id uuid not null references quiz_perguntas(id) on delete cascade,
  participante_id  uuid not null references quiz_participantes(id) on delete cascade,
  opcao_index      integer not null,
  correta          boolean not null,
  pontos_ganhos    integer not null default 0,
  respondido_em    bigint not null,
  unique (quiz_pergunta_id, participante_id)
);

-- Diferente do resto do schema (RLS desligado de propósito, ver comentário
-- no topo do arquivo): aqui a chave "anon" (pública, embutida no JS do
-- frontend) tem um motivo real pra ser barrada — sem RLS, dava pra ler
-- quiz_perguntas.correta_index direto pela API do Supabase, furando a
-- revelação (ver GET /api/quiz-play/:pin/estado, que só entrega a resposta
-- certa depois da hora). Sem nenhuma política: bloqueia anon/authenticated
-- por completo — a service_role (usada pelo backend) ignora RLS de
-- qualquer forma, então nada muda pro app.
alter table quiz_sessoes enable row level security;
alter table quiz_perguntas enable row level security;
alter table quiz_participantes enable row level security;
alter table quiz_respostas enable row level security;
