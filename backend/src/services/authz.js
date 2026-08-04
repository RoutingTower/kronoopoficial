// Autorização por role — quem pode criar/editar/excluir o quê. O middleware
// de auth (../middleware/auth.js) só confere que o token é válido; aqui é
// onde checamos se ESTE usuário pode fazer ESTA ação. Mantido separado do
// supabaseService porque é regra de negócio, não acesso a dado.
//
// users/{uid}.isAdmin === true ignora todas as checagens de "só a própria
// equipe" em todo controller (fica de fora do modelo analista/supervisor/
// coordenador de propósito). Não existe NENHUM endpoint que permita setar
// esse campo — só é possível ligar direto no Supabase (SQL Editor ou
// supabaseService), nunca via API, pra ninguém conseguir se autopromover.

const supabaseService = require("./supabaseService");

// Perfil (role, supervisorId, coordenadorId etc.) de quem está autenticado.
async function getCaller(req) {
  return supabaseService.getById("users", req.user.uid);
}

// baseMestra/ausencias/suplencias não guardam supervisorId — só analistaId
// (ou analistaOriginalId). Pra saber se um supervisor pode mexer num
// registro, precisa resolver o dono via users/{analistaId}.
async function supervisorIdDoAnalista(analistaId) {
  const analista = await supabaseService.getById("users", analistaId);
  return analista ? analista.supervisorId : null;
}

module.exports = { getCaller, supervisorIdDoAnalista };
