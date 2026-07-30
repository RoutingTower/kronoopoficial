/* Configuração de ambiente do frontend — o único arquivo que deveria mudar
   entre dev/produção (ver docs/PASSO-A-PASSO-IMPLEMENTACAO.md, Parte 7, e
   docs/FIREBASE-SETUP.md → "Ambiente de produção separado"). */

const isLocalDev = location.protocol === 'file:' || ['localhost','127.0.0.1'].includes(location.hostname);

// URL do backend (Express). Em produção (GitHub Pages/Firebase Hosting),
// como frontend e backend ficam em domínios diferentes, precisa ser uma URL
// absoluta — um caminho relativo tipo "/api" resolveria contra o próprio
// domínio do frontend, que não serve a API.
const API_BASE = isLocalDev ? 'http://localhost:3001/api' : 'https://SEU-BACKEND.onrender.com/api';

// Configuração pública do Firebase Web App (Firebase Console > Configurações
// do projeto > Seus aplicativos > app Web > ícone de engrenagem/config).
// Diferente da service account do backend, este objeto é seguro para expor
// no navegador — é assim que o SDK client-side sempre funciona.
//
// Dev e produção são projetos Firebase DIFERENTES (ver docs/FIREBASE-SETUP.md
// → "Ambiente de produção separado") — cada um tem seu próprio firebaseConfig,
// escolhido automaticamente com o mesmo isLocalDev usado acima pro API_BASE.
const firebaseConfigDev = {
  apiKey: "AIzaSyCuq--wLiCR0j1taOeE3il8_ww2n_aj0Ao",
  authDomain: "kronosop-f552e.firebaseapp.com",
  projectId: "kronosop-f552e",
  storageBucket: "kronosop-f552e.firebasestorage.app",
  messagingSenderId: "990754032986",
  appId: "1:990754032986:web:44cf91e7af76286514b763",
};

const firebaseConfigProd = {
  apiKey: "AIzaSyCBDBM8tEEXhmh1ou-rDHhQtzql12Cv2Sw",
  authDomain: "kronosop-prod.firebaseapp.com",
  projectId: "kronosop-prod",
  storageBucket: "kronosop-prod.firebasestorage.app",
  messagingSenderId: "175227549438",
  appId: "1:175227549438:web:4fad8230bbd57932f0d7af",
};

const firebaseConfig = isLocalDev ? firebaseConfigDev : firebaseConfigProd;
