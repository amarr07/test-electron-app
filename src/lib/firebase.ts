import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { config } from "./electron";

const firebaseConfig = {
  apiKey: config.FIREBASE_API_KEY,
  authDomain: config.FIREBASE_AUTH_DOMAIN,
  projectId: config.FIREBASE_PROJECT_ID,
  storageBucket: config.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: config.FIREBASE_MESSAGING_SENDER_ID,
  appId: config.FIREBASE_APP_ID,
  measurementId: config.FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * Gets or initializes Firebase app instance.
 * Returns null if config is invalid or initialization fails.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.authDomain ||
    !firebaseConfig.projectId ||
    firebaseConfig.apiKey === "" ||
    firebaseConfig.authDomain === "" ||
    firebaseConfig.projectId === ""
  ) {
    return null;
  }

  if (app) {
    return app;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
  } else {
    try {
      app = initializeApp(firebaseConfig);
    } catch {
      return null;
    }
  }

  return app;
}

/**
 * Gets Firebase Auth instance from app.
 * Returns null if app is not initialized.
 */
export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return null;
  }

  if (!auth) {
    auth = getAuth(firebaseApp);
  }

  return auth;
}
