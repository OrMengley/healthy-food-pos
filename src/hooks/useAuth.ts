import { useEffect, useState } from "react";
import { User, Role } from "@/types";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    // 1. Initial fast check from localStorage
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
      }
    }

    // 2. Subscribe to Firebase Auth state to guarantee valid authentication token
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data();
            const fullUser: User = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              name: data.name || firebaseUser.email?.split("@")[0] || "User",
              email: firebaseUser.email || "",
              username: data.username || "",
              role: (data.role as Role) || "staff",
              status: data.status || "active",
              is_archived: !!data.is_archived,
              warehouse_id: data.warehouse_id || "main",
              avatar_url: data.avatar_url || "",
              created_at: data.created_at?.toDate?.() || new Date(),
            };
            setUser(fullUser);
            setRole(fullUser.role);
            localStorage.setItem(
              "user_auth",
              JSON.stringify({
                uid: fullUser.id,
                user_info: fullUser,
                lastLogin: new Date().toISOString(),
              })
            );
          }
        } catch (err) {
          console.error("Failed to sync user profile from Firestore:", err);
        }
      } else {
        setUser(null);
        setRole(null);
        localStorage.removeItem("user_auth");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setRole(userData.role);
    localStorage.setItem(
      "user_auth",
      JSON.stringify({
        uid: userData.id,
        user_info: userData,
        lastLogin: new Date().toISOString(),
      })
    );
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    localStorage.removeItem("user_auth");
  };

  return { user, loading, role, userInfo: user, login, logout };
}

