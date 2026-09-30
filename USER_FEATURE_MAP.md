# User Feature & Authentication Architecture Map

This document outlines the complete architectural mapping for transitioning the application from **Firebase Auth SDK** to a **Simple Firestore `users` Table-Based Authentication** model.

---

## 1. Current State vs. Target State

| Aspect | Current Implementation (Firebase Auth) | Target Implementation (Simple `users` Table) |
| :--- | :--- | :--- |
| **User Identity Store** | Firebase Authentication (`firebase/auth`) + Firestore `users` collection | Single Firestore `users` collection |
| **Authentication Method** | `signInWithEmailAndPassword` via Firebase Auth SDK | Query `users` collection by `username` or `email` & match `password` |
| **User Creation** | Complex secondary Firebase App initialization (`SecondaryApp`) to prevent admin logout | Direct Firestore `addDoc` / `setDoc` into `users` collection |
| **Session Listener** | `onAuthStateChanged(auth, ...)` listener | LocalStorage-based session state (`user_auth`) read via `useAuth` hook |
| **Password Management** | `updatePassword` & `reauthenticateWithCredential` via Firebase Auth | Direct `updateDoc` on `users/{userId}` record |
| **Password Reset** | `sendPasswordResetEmail` via Firebase Auth | Direct admin password reset or security question reset in Firestore |

---

## 2. Updated Data Model (`src/types/index.ts`)

Update the `User` interface in `src/types/index.ts` to include the `password` field directly:

```typescript
// src/types/index.ts

export type Role = 'admin' | 'sale' | 'logistic';

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  password?: string;          // Direct password storage for simple auth
  role: Role;
  avatar_url?: string;
  warehouse_id?: string;
  created_at: Date;
  updated_at?: Date;
  is_archived: boolean;
}
```

---

## 3. Component & Action Migration Map

### 3.1. Firestore User Actions (`src/lib/firebase/actions.ts`)

#### A. Fetch Users (`getUsers`)
```typescript
export async function getUsers(): Promise<User[]> {
  const q = query(
    collection(db, "users"),
    where("is_archived", "==", false),
    orderBy("created_at", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    created_at: doc.data().created_at?.toDate() || new Date(),
  })) as User[];
}
```

#### B. Create User (`createUser`) — Simplified (No `SecondaryApp` needed!)
```typescript
export async function createUser(data: {
  name: string;
  username: string;
  email?: string;
  password: string;
  role: Role;
  warehouse_id?: string;
  avatar_url?: string;
}) {
  // Check if username already exists
  const existingQ = query(
    collection(db, "users"),
    where("username", "==", data.username.toLowerCase())
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    throw new Error(`Username "${data.username}" is already taken.`);
  }

  // Directly create user in Firestore users collection
  await addDoc(collection(db, "users"), {
    name: data.name,
    username: data.username.toLowerCase(),
    email: data.email || "",
    password: data.password, // Simple password field
    role: data.role,
    warehouse_id: data.warehouse_id || "",
    avatar_url: data.avatar_url || "",
    created_at: serverTimestamp(),
    is_archived: false,
  });
}
```

#### C. Authenticate User (`loginUser`)
```typescript
export async function loginUser(identifier: string, pass: string): Promise<User> {
  const cleanId = identifier.trim().toLowerCase();
  
  // Search by username or email
  const qUsername = query(
    collection(db, "users"),
    where("username", "==", cleanId),
    where("is_archived", "==", false)
  );
  let snap = await getDocs(qUsername);

  if (snap.empty) {
    const qEmail = query(
      collection(db, "users"),
      where("email", "==", cleanId),
      where("is_archived", "==", false)
    );
    snap = await getDocs(qEmail);
  }

  if (snap.empty) {
    throw new Error("Invalid username/email or password.");
  }

  const userDoc = snap.docs[0];
  const userData = userDoc.data() as User;

  if (userData.password !== pass) {
    throw new Error("Invalid username/email or password.");
  }

  return {
    id: userDoc.id,
    ...userData,
  };
}
```

#### D. Update & Change Password (`updateUser` / `changeOwnPassword`)
```typescript
export async function updateUser(id: string, data: Partial<User>) {
  const docRef = doc(db, "users", id);
  await updateDoc(docRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
}

export async function changeOwnPassword(userId: string, currentPass: string, newPass: string) {
  const userDocRef = doc(db, "users", userId);
  const userSnap = await getDoc(userDocRef);
  
  if (!userSnap.exists()) throw new Error("User not found.");
  if (userSnap.data().password !== currentPass) {
    throw new Error("Current password is incorrect.");
  }

  await updateDoc(userDocRef, {
    password: newPass,
    password_updated_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}
```

---

### 3.2. Authentication Hook (`src/hooks/useAuth.ts`)

Simplify `useAuth.ts` to manage session state directly via `localStorage` without Firebase Auth SDK listeners:

```typescript
import { useEffect, useState } from "react";
import { User, Role } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const storedAuth = localStorage.getItem("user_auth");
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed?.user_info) {
          setUser(parsed.user_info);
          setRole(parsed.user_info.role || null);
        }
      } catch (e) {
        console.error("Error reading stored user session", e);
        localStorage.removeItem("user_auth");
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setRole(userData.role);
    localStorage.setItem("user_auth", JSON.stringify({
      uid: userData.id,
      user_info: userData,
      lastLogin: new Date().toISOString(),
    }));
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    localStorage.removeItem("user_auth");
  };

  return { user, loading, role, userInfo: user, login, logout };
}
```

---

### 3.3. Login Page (`src/app/(auth)/login/page.tsx`)

Update login page submit handler to call `loginUser`:

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError("");

  try {
    const loggedInUser = await loginUser(email, password);
    login(loggedInUser); // Save to context & localStorage
    router.push("/");
  } catch (err: any) {
    setError(err.message || "Failed to login.");
  } finally {
    setLoading(false);
  }
};
```

---

### 3.4. User Management Form (`src/components/forms/UserForm.tsx`)

In `UserForm.tsx`, when creating a new user, simply call `createUser({ name, username, email, password, role, warehouse_id, avatar_url })`.
No secondary app creation, no Firebase Auth error codes!

---

## 4. Implementation Steps Summary

1. **Update Types**: Update `src/types/index.ts` with `password?: string`.
2. **Update Firebase Actions**: Update `src/lib/firebase/actions.ts` to replace Firebase Auth SDK functions with direct Firestore collection operations (`loginUser`, simplified `createUser`, `changeOwnPassword`).
3. **Refactor Auth Hook**: Refactor `src/hooks/useAuth.ts` to rely directly on `localStorage` session state.
4. **Update Auth Pages & Modals**: Update `login/page.tsx`, `UserForm.tsx`, and `ChangePasswordModal.tsx`.
