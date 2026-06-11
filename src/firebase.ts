import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyALt60yAQQbpYyBbz73jFDIO1JoPmu1p00",
  authDomain: "tharaldsenliquid.firebaseapp.com",
  projectId: "tharaldsenliquid",
  storageBucket: "tharaldsenliquid.firebasestorage.app",
  messagingSenderId: "620488948830",
  appId: "1:620488948830:web:e8d98bb0747410aae48cf",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
