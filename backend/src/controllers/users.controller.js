const supabaseService = require("../services/supabaseService");
const { getCaller } = require("../services/authz");

const COLLECTION = "users";

async function listUsers(req, res) {
  const { role, supervisorId, coordenadorId } = req.query;
  let users = await supabaseService.listAll(COLLECTION);
  if (role) users = users.filter((u) => u.role === role);
  if (supervisorId) users = users.filter((u) => u.supervisorId === supervisorId);
  if (coordenadorId) users = users.filter((u) => u.coordenadorId === coordenadorId);
  res.json(users);
}

async function getMe(req, res) {
  const user = await supabaseService.getById(COLLECTION, req.user.uid);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json(user);
}

async function getUser(req, res) {
  const user = await supabaseService.getById(COLLECTION, req.params.id);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json(user);
}

// Cria a conta no Firebase Auth e o documento Firestore correspondente com o
// mesmo id (uid) — não existe mais campo "pass": quem guarda a senha é o
// Auth, não o Firestore.
//
// Quem pode criar quem (espelha o que a UI hoje permite — ver
// frontend/js/events.js, Cadastros): supervisor cria analista da própria
// equipe; coordenador cria supervisor da própria equipe. Não existe fluxo
// para criar coordenador.
async function createUser(req, res) {
  const { role, name, email, password, supervisorId, coordenadorId, jornada } = req.body;
  if (!role || !name || !email || !password) {
    return res.status(400).json({ error: "bad_request", message: "role, name, email e password são obrigatórios" });
  }
  if (!["analista", "supervisor", "coordenador"].includes(role)) {
    return res.status(400).json({ error: "bad_request", message: "role deve ser 'analista', 'supervisor' ou 'coordenador'" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "bad_request", message: "password deve ter ao menos 6 caracteres" });
  }

  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden", message: "Usuário autenticado não encontrado." });
  const autorizado =
    caller.isAdmin ||
    (role === "analista" && caller.role === "supervisor" && supervisorId === caller.id) ||
    (role === "supervisor" && caller.role === "coordenador" && coordenadorId === caller.id);
  if (!autorizado) {
    return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para criar este usuário." });
  }

  const authUser = await supabaseService.getAuth().createUser({ email, password, displayName: name });
  const data = {
    role,
    name,
    email,
    active: true,
    supervisorId: supervisorId || null,
    coordenadorId: coordenadorId || null,
    jornada: jornada || null,
    navConfig: null,
  };
  await supabaseService.replace(COLLECTION, authUser.uid, data);
  res.status(201).json({ id: authUser.uid, ...data });
}

// Quem pode editar quem: o próprio usuário só pode mexer na própria
// personalização de menu (navConfig — é o único self-edit que existe na UI
// hoje); supervisor edita analistas da própria equipe; coordenador edita
// supervisores da própria equipe.
async function updateUser(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const caller = await getCaller(req);
  if (!caller) return res.status(403).json({ error: "forbidden", message: "Usuário autenticado não encontrado." });

  const isSelf = caller.id === existing.id;
  const bodyKeys = Object.keys(req.body);
  const isSupervisorDaEquipe = caller.role === "supervisor" && existing.role === "analista" && existing.supervisorId === caller.id;
  const isCoordenadorDaEquipe = caller.role === "coordenador" && existing.role === "supervisor" && existing.coordenadorId === caller.id;

  if (!caller.isAdmin) {
    if (isSelf) {
      // Qualquer usuário pode trocar seu próprio e-mail de login (tela de
      // Configurações, frontend/js/events.js) — o Firebase Auth já exige
      // reautenticação recente pra essa chamada chegar aqui. Senha não passa
      // por aqui: troca direto no Auth via SDK client-side (não fica em
      // nenhuma coleção do Firestore).
      if (!bodyKeys.every((k) => k === "navConfig" || k === "email")) {
        return res.status(403).json({ error: "forbidden", message: "Você só pode editar sua própria personalização de menu e e-mail." });
      }
    } else if (!isSupervisorDaEquipe && !isCoordenadorDaEquipe) {
      return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para editar este usuário." });
    }
  }

  const patch = {};
  for (const key of ["name", "email", "active", "supervisorId", "coordenadorId", "jornada", "navConfig"]) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  if (req.body.email !== undefined) {
    await supabaseService.getAuth().updateUser(req.params.id, { email: req.body.email });
  }
  if (req.body.password !== undefined) {
    await supabaseService.getAuth().updateUser(req.params.id, { password: req.body.password });
  }
  // patch pode ficar vazio (ex.: reset de senha manda só "password", que
  // vive no Auth, não na tabela) — um update sem colunas pra mudar não afeta
  // nenhuma linha, e o .single() de supabaseService.update() explode com
  // "0 rows" (PGRST116). Nesse caso não tem o que persistir na tabela.
  const updated = Object.keys(patch).length > 0
    ? await supabaseService.update(COLLECTION, req.params.id, patch)
    : existing;
  res.json(updated);
}

// Só existe fluxo na UI para supervisor excluir analista da própria equipe
// (não há botão de excluir supervisor/coordenador) — mesma restrição aqui.
async function deleteUser(req, res) {
  const existing = await supabaseService.getById(COLLECTION, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const caller = await getCaller(req);
  const autorizado =
    caller && (caller.isAdmin || (caller.role === "supervisor" && existing.role === "analista" && existing.supervisorId === caller.id));
  if (!autorizado) {
    return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para excluir este usuário." });
  }

  try {
    await supabaseService.remove(COLLECTION, req.params.id);
  } catch (err) {
    // 23503 = violação de FK (Postgres) — analista já tem Raio-X, cronômetro,
    // notificações etc. apontando pra ele. Excluir de verdade apagaria
    // histórico real; a saída é desativar (ver toggle Ativar/Desativar,
    // frontend/js/render-supervisor.js), que só tira ele da equipe ativa.
    if (err.code === "23503") {
      return res.status(409).json({
        error: "conflict",
        message: `${existing.name} já tem histórico registrado no Kronos (Raio-X, cronômetro, notificações etc.) e não pode ser excluído. Use "Desativar" pra tirá-lo da equipe sem perder esse histórico.`,
      });
    }
    throw err;
  }
  await supabaseService.getAuth().deleteUser(req.params.id).catch(() => {});
  res.status(204).send();
}

module.exports = { listUsers, getMe, getUser, createUser, updateUser, deleteUser };
