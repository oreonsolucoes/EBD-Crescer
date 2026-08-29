// firebase-config.js
// Inicialização do Firebase SDK v10 (ES Modules, via CDN oficial gstatic).
// -----------------------------------------------------------------------------
// COMO PREENCHER: no Firebase Console > Configurações do projeto > Seus apps >
// App da Web, copie o objeto firebaseConfig e cole abaixo, substituindo os
// placeholders. NÃO há segredo real aqui: essas chaves são públicas por design
// no Firebase Web. A segurança de verdade vem das Firestore Security Rules.
// -----------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "COLE_SEU_SENDER_ID",
  appId: "COLE_SEU_APP_ID",
};

export const app = initializeApp(firebaseConfig);

// Firestore com cache local persistente (offline persistence) já habilitado.
// persistentMultipleTabManager permite abrir o app em várias abas sem conflito.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Flag simples para o app avisar quando ainda está com placeholders.
export const CONFIG_PENDENTE = firebaseConfig.apiKey === "COLE_SUA_API_KEY";
