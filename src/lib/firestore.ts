import {
  collection,
  doc,
  limit as firestoreLimit,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseApp } from "./firebase";

let firestore: Firestore | null = null;

/**
 * Gets or initializes Firestore instance from Firebase app.
 */
export function getFirestoreInstance(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  if (!firestore) {
    firestore = getFirestore(app);
  }

  return firestore;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  profile_url?: string | null;
  user_onboarded?: string;
  dob?: Timestamp | null;
  audio?: string[];
  provider?: string;
  has_used_app_mode?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_sign_at: Timestamp;
  tutorial_seen?: boolean;
  live_activities_push_token?: string;
  notification_push_token?: string;
  last_toc_accepted_at?: Timestamp | null;
  organisation_id?: string | null;
  persona?: Record<string, unknown>;
  tokens?: Record<string, unknown> | null;
  tz_info?: string | null;
}

const USERS_COLLECTION = "users";

/**
 * Creates or updates user document in Firestore.
 * Attempts update first, falls back to create if document doesn't exist.
 */
export async function upsertUser(user: AppUser): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) {
    throw new Error("Firestore is not initialized");
  }

  const userRef = doc(db, USERS_COLLECTION, user.id);
  const userData = { ...user };
  delete (userData as any).id;

  try {
    await updateDoc(userRef, userData as any);
  } catch (error: any) {
    if (error?.code === "not-found" || error?.code === 5) {
      await setDoc(userRef, userData as any);
    } else {
      throw error;
    }
  }
}

export async function getUser(uid: string): Promise<AppUser | null> {
  const db = getFirestoreInstance();
  if (!db) {
    throw new Error("Firestore is not initialized");
  }

  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  return {
    id: userSnap.id,
    ...userSnap.data(),
  } as AppUser;
}

/**
 * Updates user profile fields (name, date of birth).
 * Creates user document if it doesn't exist.
 */
export async function updateUserProfile(
  uid: string,
  updates: {
    name?: string;
    dob?: Date | null;
  },
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) {
    throw new Error("Firestore is not initialized");
  }

  const userRef = doc(db, USERS_COLLECTION, uid);
  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }

  if (updates.dob !== undefined) {
    updateData.dob = updates.dob ? Timestamp.fromDate(updates.dob) : null;
  }

  try {
    await updateDoc(userRef, updateData);
  } catch (error: any) {
    if (error?.code === "not-found" || error?.code === 5) {
      const { getFirebaseAuth } = await import("./firebase");
      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const now = Timestamp.now();

      const newUserData: Partial<AppUser> = {
        id: uid,
        name: updates.name?.trim() || currentUser.displayName || "",
        email: currentUser.email || "",
        created_at: now,
        updated_at: now,
        last_sign_at: now,
        ...updateData,
      };

      await setDoc(userRef, newUserData);
    } else {
      throw error;
    }
  }
}

const CHAT_SESSIONS_COLLECTION = "chatSessions";
const MESSAGES_COLLECTION = "messages";

export interface ChatSessionData {
  id: string;
  MemoryId?: string;
  Title: string;
  Type?: string;
  CreatedAt: Timestamp;
}

export interface ChatMessageData {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Timestamp;
  metadata?: {
    sources?: Array<{
      memory_id?: string;
      title?: string;
      created_at?: string;
    }>;
  };
}

export async function getChatSessions(
  uid: string,
  limitCount: number = 50,
): Promise<ChatSessionData[]> {
  const db = getFirestoreInstance();
  if (!db) {
    throw new Error("Firestore is not initialized");
  }

  const sessionsRef = collection(
    db,
    USERS_COLLECTION,
    uid,
    CHAT_SESSIONS_COLLECTION,
  );
  const q = query(
    sessionsRef,
    orderBy("CreatedAt", "desc"),
    firestoreLimit(limitCount),
  );

  const snapshot = await getDocs(q);
  const sessions: ChatSessionData[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    sessions.push({
      id: doc.id,
      MemoryId: data.MemoryId || "",
      Title: data.Title || "Untitled Chat",
      Type: data.Type || "",
      CreatedAt: data.CreatedAt || Timestamp.now(),
    });
  });

  return sessions;
}

/**
 * Retrieves chat messages for a session, handling both old and new field name formats.
 * Extracts sources from Citations or metadata.sources fields.
 */
export async function getChatMessages(
  uid: string,
  chatId: string,
): Promise<ChatMessageData[]> {
  const db = getFirestoreInstance();
  if (!db) {
    throw new Error("Firestore is not initialized");
  }

  const messagesRef = collection(
    db,
    USERS_COLLECTION,
    uid,
    CHAT_SESSIONS_COLLECTION,
    chatId,
    MESSAGES_COLLECTION,
  );

  let q;
  try {
    q = query(messagesRef, orderBy("CreatedAt", "asc"));
  } catch {
    q = query(messagesRef, orderBy("created_at", "asc"));
  }

  const snapshot = await getDocs(q);
  const messages: ChatMessageData[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    const isUser =
      data.IsUser !== undefined ? data.IsUser : data.role === "user";
    const text = data.Text || data.content || "";
    const createdAt = data.CreatedAt || data.created_at || Timestamp.now();

    let sources:
      | Array<{ memory_id?: string; title?: string; created_at?: string }>
      | undefined;
    if (data.Citations && typeof data.Citations === "object") {
      sources = Object.entries(data.Citations).map(
        ([key, citation]: [string, any]) => ({
          memory_id: key,
          title: citation?.title || citation?.Title,
          created_at: citation?.timestamp
            ? citation.timestamp.toMillis
              ? new Date(citation.timestamp.toMillis()).toISOString()
              : citation.timestamp
            : citation?.created_at,
        }),
      );
    } else if (data.metadata?.sources) {
      sources = data.metadata.sources;
    }

    messages.push({
      id: doc.id,
      chat_id: chatId,
      role: isUser ? "user" : "assistant",
      content: text,
      created_at:
        createdAt instanceof Timestamp
          ? createdAt
          : Timestamp.fromDate(new Date(createdAt)),
      metadata: sources ? { sources } : {},
    });
  });

  return messages;
}
