// Autorização por role — quem pode criar/editar/excluir o quê. O middleware
// de auth (../middleware/auth.js) só confere que o token é válido; aqui é
// onde checamos se ESTE usuário pode fazer ESTA ação. Mantido separado do
// firestoreService porque é regra de negócio, não acesso a dado.

const firestoreService = require("./firestoreService");

// Perfil (role, supervisorId, coordenadorId etc.) de quem está autenticado.
async function getCaller(req) {
  return firestoreService.getById("users", req.user.uid);
}

// baseMestra/ausencias/suplencias não guardam supervisorId — só analistaId
// (ou analistaOriginalId). Pra saber se um supervisor pode mexer num
// registro, precisa resolver o dono via users/{analistaId}.
async function supervisorIdDoAnalista(analistaId) {
  const analista = await firestoreService.getById("users", analistaId);
  return analista ? analista.supervisorId : null;
}

module.exports = { getCaller, supervisorIdDoAnalista };
