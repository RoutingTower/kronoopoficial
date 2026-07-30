# KronoOP — Banco de dados

Banco escolhido: **Firebase** — Firestore para os dados e Firebase
Authentication para login. Plano gratuito cobre bem o volume de dados do
KronoOP, tem consultas em tempo real (útil para status "Em Andamento" e a
caixa de recados) e resolve autenticação sem reinventar nada.

O acesso ao Firestore fica isolado em
`backend/src/services/firestoreService.js` — nenhum outro arquivo deve
importar `firebase-admin` diretamente. Isso é proposital: se um dia o
projeto precisar trocar de banco, só esse serviço muda, o resto da API
continua igual.

## Setup

Crie seu próprio projeto Firebase seguindo os passos abaixo, depois popule
todas as coleções via `backend/scripts/seed-firestore.js`. Se quiser um
projeto separado para produção — ver [`../docs/ROADMAP.md`](../docs/ROADMAP.md).

1. Criar um projeto em https://console.firebase.google.com
2. Ativar **Firestore Database** (modo produção)
3. Ativar **Authentication** → método E-mail/senha
4. Gerar uma service account: Configurações do projeto → Contas de serviço →
   Gerar nova chave privada → preencher `backend/.env` com os 3 valores
   (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)

Passo a passo completo (com verificação em cada etapa e troubleshooting):
[`../docs/FIREBASE-SETUP.md`](../docs/FIREBASE-SETUP.md).

## Coleções

Baseado nas entidades hoje simuladas em `seedDB()`
(`frontend/js/state.js`). Diferente de uma planilha, o Firestore aceita
campos aninhados (mapa/array) direto no documento — não precisa achatar em
colunas.

### `users`
ID do documento = `uid` do Firebase Auth.
```js
{
  role: "analista" | "supervisor" | "coordenador",
  name: "Marina Cordeiro",
  email: "marina.cordeiro@kronoop.local",
  supervisorId: "u_sup1",       // presente se role = analista
  coordenadorId: "u_coord1",     // presente se role = supervisor
  active: true,
  jornada: {                     // presente se role = analista
    dias: ["seg","ter","qua","qui","sex"],
    horaInicio: "19:00",
    horaFim: "01:00"
  },
  navConfig: {                   // opcional — personalização do menu lateral (por usuário)
    order: ["cadastros","basemestra", "..."],  // chaves de NAV[role] na ordem escolhida
    hidden: ["ocorrencias"]                     // chaves ocultadas
  }
}
```
A senha **não** fica salva aqui — quem cuida disso é o Firebase Auth.

### `baseMestra`
```js
{
  analistaId: "u_ana1",          // ref para users
  operacao: "COL-A",
  ciclo: "T3",
  horaInicio: "19:00",
  horaFim: "23:00",
  titular: "Marina Cordeiro",
  dataInicio: "2026-07-28",      // ISO date
  dataFim: "2026-12-31"
}
```

### `ausencias`
```js
{
  analistaId: "u_ana1",
  baseMestraId: "bm_xxx",
  operacao: "COL-A", ciclo: "T3", horaInicio: "19:00", horaFim: "23:00", // copiados da base mestra
  data: "2026-07-28",
  tipo: "folga",
  suplenteId: "u_ana2"           // opcional
}
```

### `suplencias`
```js
{
  operacao: "COL-B", ciclo: "T3", horaInicio: "19:00", horaFim: "23:00",
  suplente: "Rodrigo Peixoto",
  dataCobertura: "2026-07-28",
  analistaOriginalId: "u_ana4"
}
```

### `raioX` (finalização de operação)
Criado quando o analista fecha o card da operação no kanban de Programação
(obrigatório: nota + observação com no mínimo 150 caracteres). Enquanto não
existe um registro para `analistaId+operacao+hora+data`, a operação some do
"finalizada" e vira "atraso de roteirização" assim que o horário passa —
ver `isOperacaoFinalizada()` em `frontend/js/utils.js`.
```js
{
  analistaId: "u_ana2",
  operacao: "TRI-01",
  hora: "19:00",
  data: "2026-07-28",
  estrelas: 3,                    // 1 a 5, obrigatório
  observacao: "Atraso de 12 min...", // mínimo 150 caracteres, obrigatório
  ts: Timestamp
}
```

### `recados` (comunicados)
```js
{
  from: "Camila Duarte (Supervisor)",
  to: "all_ana_u_sup1",           // id do analista, ou "all_ana_<supervisorId>" para toda a equipe
  titulo: "Revisão de rota",      // opcional
  texto: "Atenção: revisão de rota...",
  observacoes: "Detalhamento...", // opcional
  ts: Timestamp,
  lidoPor: ["u_ana2"],            // array de ids
  editado: true                   // presente só se já foi editado
}
```

### `reunioes`
```js
{
  tipo: "grupo",
  titulo: "Alinhamento semanal da operação",
  data: "2026-07-28",
  hora: "19:00",
  analistaIds: [],                // array de ids, vazio = todos
  supervisorId: "u_sup1",
  criadoPor: "Camila Duarte"
}
```

### `plantoes`
```js
{
  supervisorAusenteId: "u_sup1",
  data: "2026-07-28",
  coberturaRole: "Supervisor" | "Analista" | "Coordenador",
  coberturaNome: "Thiago Barros"
}
```

### `lembretes`
Lembrete criado pelo próprio analista (`origem: "self"`) ou enviado por um
supervisor (`origem: "supervisor"`), com CRUD próprio já implementado em
`backend/src/controllers/lembretes.controller.js` — ver `db/README.md` →
"Coleções com CRUD próprio" mais abaixo.
```js
{
  origem: "self" | "supervisor",
  analistaId: "u_ana1",           // presente se origem = self
  target: "u_ana1",               // presente se origem = supervisor; ou "all_ana_<supervisorId>"
  criadoPor: "Marina Cordeiro",
  titulo: "Ligar para o cliente", // opcional
  texto: "Descrição do lembrete",
  observacoes: "Detalhamento...", // opcional
  done: false,
  data: "2026-07-28",             // data alvo do lembrete
  hora: "19:00",                  // opcional
  ts: Timestamp
}
```

## Regras de segurança (Firestore Rules)

`firestore.rules` (raiz do projeto), publicado nos dois projetos Firebase
(dev e produção): leitura liberada pra qualquer usuário autenticado,
escrita sempre negada — toda escrita real acontece pelo backend (Admin
SDK, que ignora as rules), que é quem aplica a autorização por `role`
de verdade (`backend/src/services/authz.js`; analista só edita a própria
`navConfig`, supervisor só mexe na própria equipe, etc.). As rules aqui
são a rede de segurança contra acesso **direto** ao Firestore (hoje o
frontend só fala com o Firestore através do backend) — ver
[`../docs/FIREBASE-SETUP.md`](../docs/FIREBASE-SETUP.md) → "Passo 10" para
como publicar, e [`../backend/README.md`](../backend/README.md) →
"Autenticação" para a lista completa de regras por recurso.
