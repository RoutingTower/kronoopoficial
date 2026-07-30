// Express 4 não captura erros de handlers async — sem isso, uma rejeição
// não tratada em qualquer rota (ex.: Firestore fora do ar) derruba o
// processo inteiro (Node mata o processo em unhandledRejection).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
