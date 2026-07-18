// Firebase setup — Auth + Realtime Database
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut, updateProfile, onAuthStateChanged, type User as FBUser } from "firebase/auth";
import { getDatabase, ref, set, get, onValue, off, remove, update, push, query, orderByChild, equalTo, limitToLast, onChildAdded, onChildChanged, child } from "firebase/database";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

function looksReal(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  if (t.length === 0) return false;
  if (/^your[-_]?app|^xxx+|^placeholder|^change[_-]?me/i.test(t)) return false;
  return true;
}

export const isFirebaseConfigured =
  looksReal(firebaseConfig.apiKey) &&
  looksReal(firebaseConfig.authDomain) &&
  looksReal(firebaseConfig.projectId) &&
  looksReal(firebaseConfig.databaseURL);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: ReturnType<typeof getDatabase> | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

export { app, auth, db, ref, set, get, onValue, off, remove, update, push, query, orderByChild, equalTo, limitToLast, onChildAdded, onChildChanged, child };
export { onAuthStateChanged };
export type { FBUser };
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase not configured");
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase not configured");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string, username: string) {
  if (!auth) throw new Error("Firebase not configured");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: username });
  return cred;
}

export async function signOut() {
  if (!auth) return;
  return fbSignOut(auth);
}
