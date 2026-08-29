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
  apiKey: "AIzaSyB8bpxn2y_pYhEultUsQ13hF0CYlF0hqhE",
  authDomain: "ebd-crescer.firebaseapp.com",
  projectId: "ebd-crescer",
  storageBucket: "ebd-crescer.firebasestorage.app",
  messagingSenderId: "194214738160",
  appId: "1:194214738160:web:fe936f594fb1665a3e6a35",
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
