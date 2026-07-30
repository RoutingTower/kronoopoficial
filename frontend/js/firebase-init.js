/* Inicializa o Firebase Auth (SDK "compat", carregado via CDN em index.html)
   e expõe um wrapper mínimo em window.KronoAuth para o resto do frontend
   (ui.js, state.js) usar sem precisar lidar com a API do Firebase direto. */

firebase.initializeApp(firebaseConfig);
const _fbAuth = firebase.auth();

const KronoAuth = {
  async signIn(email, password){
    const cred = await _fbAuth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },
  async signOutUser(){
    try{ await _fbAuth.signOut(); }catch(e){ /* sessão local já é limpa de qualquer forma */ }
  },
  // Token do usuário logado, para anexar em "Authorization: Bearer <token>".
  // Retorna null se não houver sessão ativa do Firebase Auth.
  async getIdToken(){
    const user = _fbAuth.currentUser;
    if(!user) return null;
    return user.getIdToken();
  },
  // Confirma a senha atual antes de trocar e-mail/senha (tela de
  // Configurações) — o Firebase exige login "recente" pra essas duas
  // operações, e pedir a senha de novo aqui é a forma mais simples de
  // garantir isso sem forçar logout/login. A troca de e-mail em si não passa
  // por aqui: o SDK client-side (updateEmail) exige verificar o e-mail novo
  // antes de trocar, então quem troca de fato é o backend via Admin SDK
  // (PATCH /api/users/:id, sem essa exigência) — reautenticar continua
  // sendo o gate de segurança que confirma a senha atual.
  async reauthenticate(email, currentPassword){
    const user = _fbAuth.currentUser;
    if(!user) throw new Error('Sessão expirada. Faça login de novo.');
    const cred = firebase.auth.EmailAuthProvider.credential(email, currentPassword);
    await user.reauthenticateWithCredential(cred);
  },
  async changePassword(newPassword){
    const user = _fbAuth.currentUser;
    if(!user) throw new Error('Sessão expirada. Faça login de novo.');
    await user.updatePassword(newPassword);
  },
  // Mensagens de erro do Firebase Auth traduzidas para o usuário final.
  friendlyError(err){
    const map = {
      'auth/invalid-email': 'E-mail inválido.',
      'auth/user-disabled': 'Usuário desativado. Fale com seu coordenador.',
      'auth/user-not-found': 'E-mail ou senha inválidos.',
      'auth/wrong-password': 'E-mail ou senha inválidos.',
      'auth/invalid-credential': 'E-mail ou senha inválidos.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com o servidor de autenticação.',
      'auth/requires-recent-login': 'Sessão expirada para essa ação. Faça login de novo e tente outra vez.',
      'auth/email-already-in-use': 'Esse e-mail já está em uso por outra conta.',
      'auth/weak-password': 'Senha muito curta — use ao menos 6 caracteres.',
    };
    return map[err?.code] || 'Não foi possível completar a ação. Tente novamente.';
  },
};
