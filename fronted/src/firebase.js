// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // 1. Import Firestore
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDN4aR_iL7I6p2woLGZPSiiKzp5QSEEzus",
  authDomain: "fyp-chatbot-e22c5.firebaseapp.com",
  projectId: "fyp-chatbot-e22c5",
  storageBucket: "fyp-chatbot-e22c5.firebasestorage.app",
  messagingSenderId: "252336722604",
  appId: "1:252336722604:web:e47a84661753648ec7c509"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // 2. Initialize and Export db