import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA-VTTYuvI-UaQWjpNAWm8110LyNe1cz2k",
  authDomain: "tgi-ascenseurs.firebaseapp.com",
  projectId: "tgi-ascenseurs",
  storageBucket: "tgi-ascenseurs.firebasestorage.app",
  messagingSenderId: "547563854158",
  appId: "1:547563854158:web:49ac0574217c5ce459a61f",
};

const app = getApps().some(({ name }) => name === "[DEFAULT]") ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
