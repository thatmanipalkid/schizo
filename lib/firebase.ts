import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export function getFirebaseConfigError() {
  if (missingConfig.length === 0) return "";
  return `Firebase is not configured. Add ${missingConfig.join(", ")} to your .env.local file.`;
}

export async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  const configError = getFirebaseConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const authResult = await Promise.race([
    signInAnonymously(auth),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firebase authentication timed out. Check your internet connection and Firebase Auth setup.")), 15000);
    }),
  ]);

  return authResult.user;
}
