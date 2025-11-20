import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBGFdoTqvmmUnN4AzVaSwmqFBOd_Hp_kN8",
  authDomain: "quiz-16f0a.firebaseapp.com",
  projectId: "quiz-16f0a",
  storageBucket: "quiz-16f0a.firebasestorage.app",
  messagingSenderId: "519032763562",
  appId: "1:519032763562:web:3e9cccd8efbd1e69f38cd3",
  measurementId: "G-NHEWZT6RXN"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
