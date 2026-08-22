// Camada de acesso ao Supabase (Postgres + Auth) — mesma assinatura de
// "./firestoreService.js" (listAll, getById, create, update, replace,
// remove, getAuth) de propósito: enquanto o cutover não acontece, os dois
// arquivos coexistem, e o dia da troca é literalmente mudar o
// require("./firestoreService") para require("./supabaseService") em cada
// controller — nenhum controller precisa saber qual dos dois está por trás.
// Ver docs/MIGRACAO-SUPABASE.md.
//
// Nomes de coleção (ex.: "baseMestra", "raioX") e de campo (ex.:
// "analistaId", "horaInicio") continuam em camelCase nos controllers — a
// conversão para snake_case (nome de tabela/coluna no Postgres) acontece
// só aqui, nos dois sentidos.

const { supabase: supabaseConfig } = require("../config/env");

let client = null;

function getClient() {
  if (client) return client;
  const { createClient } = require("@supabase/supabase-js");
  client = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

function toSnake(key) {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function toCamel(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// "from"/"to" em "recados" viram "remetente"/"destino" no schema — ver
// docs/MIGRACAO-SUPABASE.md ("`from`/`to` viram..."). Todo o resto é
// conversão automática de caixa, sem exceção.
const FIELD_OVERRIDES = {
  recados: { from: "remetente", to: "destino" },
};
const FIELD_OVERRIDES_REVERSE = {
  recados: { remetente: "from", destino: "to" },
};

function rowToSnake(collection, obj) {
  const overrides = FIELD_OVERRIDES[collection] || {};
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[overrides[key] || toSnake(key)] = value;
  }
  return out;
}

function rowToCamel(collection, row) {
  if (!row) return row;
  const overrides = FIELD_OVERRIDES_REVERSE[collection] || {};
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[overrides[key] || toCamel(key)] = value;
  }
  return out;
}

function tableName(collection) {
  return toSnake(collection);
}

// A API do Supabase (PostgREST) limita cada resposta a 1000 linhas por
// padrão, mesmo sem LIMIT explícito no select — sem essa paginação, tabelas
// que passam de 1000 linhas (ex.: raio_x, depois da importação em massa da
// planilha) tinham parte dos registros simplesmente OMITIDOS do resultado,
// silenciosamente (sem erro), dependendo de qual "página" o Postgres decide
// devolver. Ordena por id (chave estável) pra garantir que cada página
// pegue um recorte diferente, sem pular nem repetir linha.
const PAGE_SIZE = 1000;
async function fetchAllPages(buildQuery) {
  const linhas = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return linhas;
}

async function listAll(collection) {
  const data = await fetchAllPages(() => getClient().from(tableName(collection)).select("*"));
  return data.map((row) => rowToCamel(collection, row));
}

// Mesma assinatura de firestoreService.listWhere — [campo, operador, valor]
// em camelCase, convertido pra snake_case aqui como o resto do arquivo.
const SUPABASE_OPS = { ">=": "gte", "<=": "lte", "==": "eq" };
async function listWhere(collection, conditions) {
  const data = await fetchAllPages(() => {
    let query = getClient().from(tableName(collection)).select("*");
    for (const [field, op, value] of conditions) {
      const method = SUPABASE_OPS[op];
      if (!method) throw new Error(`operador não suportado em listWhere: ${op}`);
      query = query[method](toSnake(field), value);
    }
    return query;
  });
  return data.map((row) => rowToCamel(collection, row));
}

async function getById(collection, id) {
  const { data, error } = await getClient().from(tableName(collection)).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return rowToCamel(collection, data);
}

async function create(collection, data) {
  const { data: inserted, error } = await getClient()
    .from(tableName(collection))
    .insert(rowToSnake(collection, data))
    .select()
    .single();
  if (error) throw error;
  return rowToCamel(collection, inserted);
}

async function update(collection, id, data) {
  const { data: updated, error } = await getClient()
    .from(tableName(collection))
    .update(rowToSnake(collection, data))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToCamel(collection, updated);
}

// Cria com id explícito, substituindo o registro inteiro se já existir —
// equivalente ao antigo doc.set() sem merge. Único uso hoje:
// users.controller.js grava o documento do usuário usando o id que o
// Supabase Auth gerou pro uid, em vez de deixar o banco gerar um novo.
async function replace(collection, id, data) {
  const { data: upserted, error } = await getClient()
    .from(tableName(collection))
    .upsert(rowToSnake(collection, { ...data, id }))
    .select()
    .single();
  if (error) throw error;
  return rowToCamel(collection, upserted);
}

async function remove(collection, id) {
  const { error } = await getClient().from(tableName(collection)).delete().eq("id", id);
  if (error) throw error;
}

// Shim com a mesma superfície do firebase-admin Auth usada hoje em
// middleware/auth.js e users.controller.js (createUser, updateUser,
// deleteUser, verifyIdToken) — só troca a implementação por baixo pela API
// de Admin do Supabase Auth.
function getAuth() {
  return {
    async createUser({ email, password, displayName }) {
      const { data, error } = await getClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: displayName ? { name: displayName } : undefined,
      });
      if (error) throw error;
      return { uid: data.user.id, email: data.user.email };
    },
    async updateUser(uid, patch) {
      const { data, error } = await getClient().auth.admin.updateUserById(uid, patch);
      if (error) throw error;
      return { uid: data.user.id, email: data.user.email };
    },
    async deleteUser(uid) {
      const { error } = await getClient().auth.admin.deleteUser(uid);
      if (error) throw error;
    },
    // A Admin API do Supabase não tem um "getUserByEmail" direto — lista e
    // filtra em memória. Aceitável aqui porque só é usado por
    // scripts/create-admin.js (dataset pequeno, uso manual, não é caminho
    // quente da API). Lança err.code = "user_not_found" quando não acha —
    // scripts/create-admin.js precisa trocar o código que checa hoje
    // ("auth/user-not-found", do Firebase) por esse no dia do cutover.
    async getUserByEmail(email) {
      const { data, error } = await getClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const found = data.users.find((u) => u.email === email);
      if (!found) {
        const notFound = new Error("Usuário não encontrado");
        notFound.code = "user_not_found";
        throw notFound;
      }
      return { uid: found.id, email: found.email };
    },
    async verifyIdToken(token) {
      const { data, error } = await getClient().auth.getUser(token);
      if (error) throw error;
      return { uid: data.user.id, email: data.user.email || null };
    },
  };
}

module.exports = { getClient, getAuth, listAll, listWhere, getById, create, update, replace, remove };
