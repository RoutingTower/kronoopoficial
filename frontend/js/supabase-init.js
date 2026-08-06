/* Equivalente a firebase-init.js, mas para Supabase Auth (SDK via CDN,
   github.com/supabase/supabase-js). Ainda NÃO está incluído em index.html —
   plugar (e remover firebase-init.js + os <script> do Firebase) é o passo
   de cutover do frontend, só no dia da migração (ver
   docs/MIGRACAO-SUPABASE.md). Até lá, este arquivo fica pronto e não
   afeta nada em produção.

   Define window.KronoAuth com a MESMA interface de firebase-init.js —
   ui.js/state.js não precisam saber qual dos dois está por trás. */

const _sbClient = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);

const KronoAuth = {
  async signIn(email, password){
    const { data, error } = await _sbClient.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data.user;
  },
  async signOutUser(){
    try{ await _sbClient.auth.signOut(); }catch(e){ /* sessão local já é limpa de qualquer forma */ }
  },
  // Token do usuário logado, para anexar em "Authorization: Bearer <token>".
  // Retorna null se não houver sessão ativa.
  async getIdToken(){
    const { data } = await _sbClient.auth.getSession();
    return data.session ? data.session.access_token : null;
  },
  // Tenta renovar a sessão usando o refresh_token guardado — usado quando
  // uma chamada à API volta 401 (ver apiRequest, state.js): a aba pode ter
  // ficado aberta tempo o bastante pro access_token expirar sem que
  // getSession() tenha renovado sozinho a tempo. Retorna true se conseguiu
  // uma sessão nova, false se o refresh_token também já não vale mais
  // (nesse caso só resta logar de novo).
  async refreshSession(){
    const { data, error } = await _sbClient.auth.refreshSession();
    return !error && !!data.session;
  },
  // Confirma a senha atual antes de trocar e-mail/senha (tela de
  // Configurações) — mesmo papel que tinha no Firebase: reautenticar é o
  // gate de segurança, não uma troca de fato (essa continua indo pelo
  // backend via Admin API, PATCH /api/users/:id).
  async reauthenticate(email, currentPassword){
    const { error } = await _sbClient.auth.signInWithPassword({ email, password: currentPassword });
    if(error) throw new Error('Sessão expirada. Faça login de novo.');
  },
  async changePassword(newPassword){
    const { error } = await _sbClient.auth.updateUser({ password: newPassword });
    if(error) throw error;
  },
  // Mesmo papel que a versão Firebase (ver firebase-init.js): dispara
  // callback(user|null) no login, no logout, e imediatamente ao registrar —
  // o supabase-js v2 já entrega a sessão persistida (INITIAL_SESSION) nesse
  // primeiro disparo, então cobre o caso de reload de página igual o
  // onAuthStateChanged do Firebase cobria.
  onAuthStateChanged(callback){
    _sbClient.auth.onAuthStateChange((_event, session)=> callback(session ? session.user : null));
  },
  // Mensagens de erro do Supabase Auth traduzidas para o usuário final.
  // Códigos conferidos na versão do supabase-js usada no cutover — a lib
  // já teve mudanças de nomenclatura entre versões major.
  friendlyError(err){
    const map = {
      'invalid_credentials': 'E-mail ou senha inválidos.',
      'user_not_found': 'E-mail ou senha inválidos.',
      'user_banned': 'Usuário desativado. Fale com seu coordenador.',
      'over_request_rate_limit': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
      'weak_password': 'Senha muito curta — use ao menos 6 caracteres.',
      'email_exists': 'Esse e-mail já está em uso por outra conta.',
      'network_error': 'Sem conexão com o servidor de autenticação.',
    };
    const code = err?.code || err?.error_code;
    return map[code] || 'Não foi possível completar a ação. Tente novamente.';
  },
};
