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
    };
    return map[err?.code] || 'Não foi possível entrar. Tente novamente.';
  },
};
