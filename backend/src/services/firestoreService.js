// Camada de acesso ao Firestore — nenhum outro arquivo deve importar
// "firebase-admin" diretamente, só este serviço. Assim, se um dia o projeto
// precisar trocar de banco, só este arquivo muda.

const { firebase: firebaseConfig } = require("../config/env");

let db = null;
let auth = null;

function initAdmin() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseConfig.projectId,
        clientEmail: firebaseConfig.clientEmail,
        privateKey: firebaseConfig.privateKey,
      }),
    });
  }
  return admin;
}

function getDb() {
  if (db) return db;
  db = initAdmin().firestore();
  return db;
}

function getAuth() {
  if (auth) return auth;
  auth = initAdmin().auth();
  return auth;
}

async function listAll(collection) {
  const snapshot = await getDb().collection(collection).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// Igual a listAll, mas filtrando no próprio Firestore em vez de buscar a
// coleção inteira e filtrar em memória — só os documentos que batem com a
// condição contam como leitura. `conditions` é uma lista de
// [campo, operador, valor], ex.: [["data", ">=", "2026-07-01"]].
async function listWhere(collection, conditions) {
  let query = getDb().collection(collection);
  for (const [field, op, value] of conditions) {
    query = query.where(field, op, value);
  }
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getById(collection, id) {
  const doc = await getDb().collection(collection).doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function create(collection, data) {
  const ref = await getDb().collection(collection).add(data);
  return { id: ref.id, ...data };
}

async function update(collection, id, data) {
  await getDb().collection(collection).doc(id).set(data, { merge: true });
  return getById(collection, id);
}

// Sobrescreve o documento inteiro (sem merge) — usado pelo endpoint de
// estado global, que sempre envia o snapshot completo do DB.
async function replace(collection, id, data) {
  await getDb().collection(collection).doc(id).set(data);
  return getById(collection, id);
}

async function remove(collection, id) {
  await getDb().collection(collection).doc(id).delete();
}

module.exports = { getDb, getAuth, listAll, listWhere, getById, create, update, replace, remove };
