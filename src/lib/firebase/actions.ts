import { initializeApp, getApps } from "firebase/app";
import { db, auth, firebaseConfig } from "./config";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    createUserWithEmailAndPassword,
    updatePassword,
    getAuth 
} from "firebase/auth";

import {
    collection,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    runTransaction,
    Timestamp,
} from "firebase/firestore";
import { Category, Product, User, Role } from "@/types";
import { parseFirestoreDate } from "@/lib/utils";

function getSecondaryAuth() {
    const secondaryAppName = "SecondaryUserAuthApp";
    const existingApp = getApps().find((a) => a.name === secondaryAppName);
    const secondaryApp = existingApp || initializeApp(firebaseConfig, secondaryAppName);
    return getAuth(secondaryApp);
}

// --- Categories ---

export async function getCategories(): Promise<Category[]> {
    const q = query(
        collection(db, "categories"),
        where("is_archived", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                status: data.status || "active",
                created_at: parseFirestoreDate(data.created_at),
            } as Category;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getArchivedCategories(): Promise<Category[]> {
    const q = query(
        collection(db, "categories"),
        where("is_archived", "==", true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                status: data.status || "active",
                created_at: parseFirestoreDate(data.created_at),
                archived_at: parseFirestoreDate(data.archived_at),
            } as Category;
        })
        .sort((a, b) => {
            const dateB = (b as any).archived_at ? new Date((b as any).archived_at).getTime() : new Date(b.created_at).getTime();
            const dateA = (a as any).archived_at ? new Date((a as any).archived_at).getTime() : new Date(a.created_at).getTime();
            return dateB - dateA;
        });
}

export async function createCategory(data: { name: string; image?: string; status?: "active" | "inactive" } | string) {
    const payload = typeof data === "string" 
        ? { name: data, status: "active" as const } 
        : { status: "active" as const, ...data };
        
    await addDoc(collection(db, "categories"), {
        ...payload,
        created_at: serverTimestamp(),
        is_archived: false,
    });
}

export async function updateCategory(id: string, data: { name: string; image?: string; status?: "active" | "inactive" } | string) {
    const docRef = doc(db, "categories", id);
    const payload = typeof data === "string" ? { name: data } : data;
    await updateDoc(docRef, {
        ...payload,
        updated_at: serverTimestamp(),
    });
}

export async function archiveCategory(id: string) {
    const docRef = doc(db, "categories", id);
    await updateDoc(docRef, {
        is_archived: true,
        archived_at: serverTimestamp(),
    });
}

export async function restoreCategory(id: string) {
    const docRef = doc(db, "categories", id);
    await updateDoc(docRef, {
        is_archived: false,
        restored_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
}

export async function deleteCategoryPermanent(id: string) {
    const docRef = doc(db, "categories", id);
    await deleteDoc(docRef);
}

// --- Users ---

export async function getUsers(): Promise<User[]> {
    const q = query(
        collection(db, "users"),
        where("is_archived", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                created_at: parseFirestoreDate(data.created_at),
            } as User;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createUser(data: { 
    name: string; 
    username: string; 
    role: Role; 
    email?: string; 
    password?: string; 
    avatar_url?: string; 
    warehouse_id?: string;
}) {
    if (!data.password) throw new Error("Password is required for new users");
    if (!data.username) throw new Error("Username is required");

    const cleanUsername = data.username.trim().toLowerCase();
    const cleanEmail = data.email?.trim().toLowerCase() || `${cleanUsername}@healthyfood.pos`;

    const existingQ = query(
        collection(db, "users"),
        where("username", "==", cleanUsername)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
        throw new Error(`Username "${data.username}" is already taken.`);
    }

    // 1. Create Firebase Auth account using isolated secondary auth instance so current session is preserved
    const secondaryAuth = getSecondaryAuth();
    let uid: string;
    try {
        const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            cleanEmail,
            data.password
        );
        uid = userCredential.user.uid;
    } catch (authErr: any) {
        if (authErr.code === "auth/email-already-in-use") {
            throw new Error(`Username "${data.username}" is already registered.`);
        }
        if (authErr.code === "auth/weak-password") {
            throw new Error("Password should be at least 6 characters.");
        }
        throw new Error(authErr.message || "Failed to create authentication account.");
    } finally {
        await signOut(secondaryAuth);
    }

    // 2. Create the Firestore document under users/{uid}
    const userDocRef = doc(db, "users", uid);
    await setDoc(userDocRef, {
        id: uid,
        uid: uid,
        name: data.name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        password: data.password,
        role: data.role,
        warehouse_id: data.warehouse_id || "main",
        avatar_url: data.avatar_url || "",
        status: "active",
        is_archived: false,
        created_at: serverTimestamp(),
    });

    return uid;
}

export async function loginUser(identifier: string, pass: string): Promise<User> {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId) throw new Error("Please enter your username.");
    if (!pass) throw new Error("Please enter your password.");

    let targetEmail: string | null = null;
    let foundDocSnap: any = null;

    // 1. Check if user exists by username in Firestore
    const usernameQuery = query(
        collection(db, "users"),
        where("username", "==", cleanId)
    );
    const usernameSnap = await getDocs(usernameQuery);

    if (!usernameSnap.empty) {
        foundDocSnap = usernameSnap.docs[0];
    }

    // 2. If not found by username and input contains '@', try lookup by email
    if (!foundDocSnap && cleanId.includes("@")) {
        const emailQuery = query(
            collection(db, "users"),
            where("email", "==", cleanId)
        );
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty) {
            foundDocSnap = emailSnap.docs[0];
        }
    }

    // 3. Fallback: Check if there is any user document matching name or email prefix or doc id
    if (!foundDocSnap) {
        const allUsersSnap = await getDocs(query(collection(db, "users")));
        foundDocSnap = allUsersSnap.docs.find((d) => {
            const data = d.data();
            const u = (data.username || "").trim().toLowerCase();
            const e = (data.email || "").trim().toLowerCase();
            return u === cleanId || e === cleanId || e.startsWith(cleanId + "@") || d.id === cleanId;
        }) || null;
    }

    if (foundDocSnap) {
        const foundData = foundDocSnap.data();
        if (foundData.is_archived || foundData.status === "inactive") {
            throw new Error("This account is currently deactivated. Please contact the administrator.");
        }
        if (foundData.email) {
            targetEmail = foundData.email.trim().toLowerCase();
        }
    }

    const emailCandidates = new Set<string>();
    if (targetEmail) emailCandidates.add(targetEmail);
    if (cleanId.includes("@")) emailCandidates.add(cleanId);
    emailCandidates.add(`${cleanId}@healthyfood.pos`);
    emailCandidates.add(`${cleanId}@healthyfood.com`);
    if (foundDocSnap?.data()?.username) {
        const u = foundDocSnap.data().username.trim().toLowerCase();
        emailCandidates.add(`${u}@healthyfood.pos`);
        emailCandidates.add(`${u}@healthyfood.com`);
    }

    const uniqueEmails = Array.from(emailCandidates);

    // 4. Authenticate with Firebase Authentication
    let userCredential: any = null;
    let lastAuthError: any = null;

    // Try authenticating with candidate emails
    for (const email of uniqueEmails) {
        try {
            userCredential = await signInWithEmailAndPassword(auth, email, pass);
            break;
        } catch (err: any) {
            lastAuthError = err;
        }
    }

    // If direct login failed, but Firestore has stored password that matches pass
    // and Firebase Auth still had an old/previous password or fallback:
    if (!userCredential && foundDocSnap) {
        const foundData = foundDocSnap.data();
        if (foundData.password === pass) {
            const fallbackPasses = [foundData.previous_password, "123123", "123456", "admin123", "password"].filter(Boolean);
            for (const email of uniqueEmails) {
                if (userCredential) break;
                for (const oldP of fallbackPasses) {
                    try {
                        userCredential = await signInWithEmailAndPassword(auth, email, oldP);
                        if (userCredential?.user) {
                            // Automatically sync Firebase Auth to the new password!
                            await updatePassword(userCredential.user, pass);
                        }
                        break;
                    } catch {
                        // ignore and try next candidate
                    }
                }
            }
        }
    }

    if (!userCredential) {
        if (
            lastAuthError?.code === "auth/invalid-credential" ||
            lastAuthError?.code === "auth/wrong-password" ||
            lastAuthError?.code === "auth/user-not-found" ||
            lastAuthError?.code === "auth/invalid-email" ||
            !foundDocSnap
        ) {
            throw new Error("Invalid username or password. Please try again.");
        }
        throw new Error(lastAuthError?.message || "Failed to authenticate.");
    }

    const uid = userCredential.user.uid;

    // 5. Fetch user profile from Firestore users/{uid}
    const userDocRef = doc(db, "users", uid);
    const userSnap = await getDoc(userDocRef);

    let userData: User;
    if (userSnap.exists()) {
        userData = userSnap.data() as User;
    } else if (foundDocSnap) {
        userData = foundDocSnap.data() as User;
    } else {
        await signOut(auth);
        throw new Error("No user profile record found for this account. Please contact the administrator.");
    }

    if (userData.is_archived || userData.status === "inactive") {
        await signOut(auth);
        throw new Error("This account is currently deactivated. Please contact the store owner.");
    }

    return {
        ...userData,
        id: uid,
        uid: uid,
        email: userData.email || userCredential.user.email || targetEmail || `${cleanId}@healthyfood.pos`,
        name: userData.name || userData.username || cleanId,
        username: userData.username || cleanId,
        role: userData.role || "staff",
        status: userData.status || "active",
        created_at: parseFirestoreDate(userData.created_at),
    };
}


export async function archiveUser(id: string) {
    const docRef = doc(db, "users", id);
    await updateDoc(docRef, {
        is_archived: true,
        archived_at: serverTimestamp(),
    });
}

export async function updateUser(id: string, data: Partial<User>) {
    const docRef = doc(db, "users", id);
    await updateDoc(docRef, {
        ...data,
        updated_at: serverTimestamp(),
    });
}

export async function deleteUserPermanent(id: string) {
    const docRef = doc(db, "users", id);
    await deleteDoc(docRef);
}

export async function changeOwnPassword(userId: string, currentPass: string, newPass: string) {
    const userDocRef = doc(db, "users", userId);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) throw new Error("User not found.");
    if (userSnap.data().password !== currentPass) {
        throw new Error("auth/wrong-password");
    }

    await updateDoc(userDocRef, {
        password: newPass,
        password_updated_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
}

export async function adminChangeUserPassword(userId: string, newPass: string, oldPassHint?: string) {
    if (!newPass || newPass.length < 6) {
        throw new Error("Password must be at least 6 characters.");
    }

    const userDocRef = doc(db, "users", userId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
        throw new Error("User record not found in database.");
    }

    const userData = userSnap.data() as User & { password?: string; previous_password?: string };
    
    // Candidate emails to attempt
    const emailCandidates = new Set<string>();
    if (userData.email) emailCandidates.add(userData.email.trim().toLowerCase());
    if (userData.username) {
        const u = userData.username.trim().toLowerCase();
        emailCandidates.add(`${u}@healthyfood.pos`);
        emailCandidates.add(`${u}@healthyfood.com`);
    }
    if (userId) {
        emailCandidates.add(`${userId}@healthyfood.pos`);
    }

    // Candidate current passwords
    const passwordCandidates = new Set<string>();
    if (oldPassHint?.trim()) passwordCandidates.add(oldPassHint.trim());
    if (userData.password) passwordCandidates.add(userData.password);
    if (userData.previous_password) passwordCandidates.add(userData.previous_password);
    passwordCandidates.add("123123");
    passwordCandidates.add("123456");
    passwordCandidates.add("admin123");
    passwordCandidates.add("password");
    passwordCandidates.add("12345678");

    let authUpdated = false;

    // 1. If modifying currently logged in user directly
    if (auth.currentUser && auth.currentUser.uid === userId) {
        try {
            await updatePassword(auth.currentUser, newPass);
            authUpdated = true;
        } catch (selfAuthErr: any) {
            console.warn("Direct auth.currentUser updatePassword attempt:", selfAuthErr);
        }
    }

    // 2. Try secondary auth instance with candidate credentials
    if (!authUpdated) {
        const secondaryAuth = getSecondaryAuth();
        for (const email of Array.from(emailCandidates)) {
            if (authUpdated) break;
            for (const oldPass of Array.from(passwordCandidates)) {
                try {
                    const userCred = await signInWithEmailAndPassword(secondaryAuth, email, oldPass);
                    await updatePassword(userCred.user, newPass);
                    authUpdated = true;
                    if (!userData.email || userData.email !== email) {
                        userData.email = email;
                    }
                    await signOut(secondaryAuth);
                    break;
                } catch (err: any) {
                    await signOut(secondaryAuth).catch(() => {});
                }
            }
        }
    }

    if (!authUpdated) {
        throw new Error(
            "Could not verify current user authentication credentials in Firebase Auth. If this account was created manually, please enter the current password or check Firebase Authentication."
        );
    }

    // 3. Update password in Firestore
    await updateDoc(userDocRef, {
        password: newPass,
        previous_password: userData.password || oldPassHint || "123123",
        email: userData.email || Array.from(emailCandidates)[0],
        password_updated_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
}

// --- Products ---

export async function getProducts(): Promise<Product[]> {
    const q = query(
        collection(db, "products"),
        where("is_archived", "==", false)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                status: data.status || "active",
                created_at: parseFirestoreDate(data.created_at),
            } as Product;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createProduct(
    data: Omit<Product, "id" | "created_at" | "is_archived">,
    initialStock?: number,
    createdBy?: string
): Promise<string> {
    const stockQty = Number(initialStock) || 0;
    const cleanBarcode = data.barcode.trim();
    const now = new Date();

    // 1. Enforce barcode uniqueness check before transaction
    const existingBarcodeQ = query(
        collection(db, "products"),
        where("barcode", "==", cleanBarcode),
        where("is_archived", "==", false)
    );
    const existingSnap = await getDocs(existingBarcodeQ);
    if (!existingSnap.empty) {
        throw new Error(`A product with barcode "${cleanBarcode}" already exists.`);
    }

    return await runTransaction(db, async (transaction) => {
        // ─── 2. READ PHASE (All transaction reads MUST happen first) ───
        const counterRef = doc(db, "counters", "product_barcode");
        let counterSnap: any = null;
        let numPart = 0;

        if (cleanBarcode.startsWith("HF-")) {
            numPart = parseInt(cleanBarcode.replace("HF-", ""), 10);
            if (!isNaN(numPart) && numPart > 0) {
                counterSnap = await transaction.get(counterRef);
            }
        }

        // ─── 3. WRITE PHASE (All writes happen after reads) ───
        const productRef = doc(collection(db, "products"));
        const productData = {
            name: data.name.trim(),
            barcode: cleanBarcode,
            price: Number(data.price) || 0,
            cost: Number(data.cost || data.cost_recommand || 0),
            cost_recommand: Number(data.cost || data.cost_recommand || 0),
            category_id: data.category_id || "",
            status: data.status || "active",
            description: data.description?.trim() || "",
            images: data.images || [],
            thumbnails: data.thumbnails || [],
            created_at: serverTimestamp(),
            is_archived: false,
        };
        transaction.set(productRef, productData);

        // Update sequential counter if HF-XXXXXX format is used
        if (counterSnap && numPart > 0) {
            const currentLast = counterSnap.exists() ? (counterSnap.data().last_number || 0) : 0;
            if (numPart > currentLast) {
                transaction.set(counterRef, {
                    last_number: numPart,
                    updated_at: serverTimestamp(),
                }, { merge: true });
            }
        }

        // Initial Stock creation & movement log if initialStock was provided
        if (stockQty > 0) {
            const costVal = Number(data.cost || data.cost_recommand || 0);
            
            const stockRef = doc(collection(db, "stocks"));
            transaction.set(stockRef, {
                product_id: productRef.id,
                product_barcode: cleanBarcode,
                warehouse_id: "main",
                product: { ...data, id: productRef.id, status: data.status || "active" },
                cost: costVal,
                quantity: stockQty,
                date: Timestamp.fromDate(now),
                created_by: createdBy || "Admin",
                created_at: serverTimestamp(),
                is_archived: false,
            });

            const movementRef = doc(collection(db, "stock_movements"));
            transaction.set(movementRef, {
                product_id: productRef.id,
                product_name: data.name,
                product_barcode: cleanBarcode,
                type: "stock_in",
                quantity: stockQty,
                unit_cost: costVal,
                total_cost: costVal * stockQty,
                to_warehouse_id: "main",
                previous_stock_level: 0,
                new_stock_level: stockQty,
                note: "Initial Stock on Product Creation",
                created_by: createdBy || "Admin",
                created_by_name: createdBy || "Admin",
                date: Timestamp.fromDate(now),
                created_at: serverTimestamp(),
            });
        }

        return productRef.id;
    });
}

export async function updateProduct(id: string, data: Partial<Product>) {
    if (data.barcode) {
        const cleanBarcode = data.barcode.trim();
        const existingBarcodeQ = query(
            collection(db, "products"),
            where("barcode", "==", cleanBarcode),
            where("is_archived", "==", false)
        );
        const existingSnap = await getDocs(existingBarcodeQ);
        const hasOtherProductWithBarcode = existingSnap.docs.some((d) => d.id !== id);
        if (hasOtherProductWithBarcode) {
            throw new Error(`A product with barcode "${cleanBarcode}" already exists.`);
        }
    }

    const docRef = doc(db, "products", id);
    
    // Explicitly allow only non-stock product fields to prevent direct stock overwrites
    const safeUpdateData: Record<string, unknown> = {
        updated_at: serverTimestamp(),
    };

    if (data.name !== undefined) safeUpdateData.name = data.name.trim();
    if (data.barcode !== undefined) safeUpdateData.barcode = data.barcode.trim();
    if (data.price !== undefined) safeUpdateData.price = Number(data.price) || 0;
    if (data.cost !== undefined) safeUpdateData.cost = Number(data.cost) || 0;
    if (data.cost_recommand !== undefined) safeUpdateData.cost_recommand = Number(data.cost_recommand) || 0;
    if (data.category_id !== undefined) safeUpdateData.category_id = data.category_id;
    if (data.status !== undefined) safeUpdateData.status = data.status;
    if (data.description !== undefined) safeUpdateData.description = data.description.trim();
    if (data.images !== undefined) safeUpdateData.images = data.images;
    if (data.thumbnails !== undefined) safeUpdateData.thumbnails = data.thumbnails;

    await updateDoc(docRef, safeUpdateData);
}

export async function archiveProduct(id: string) {
    const docRef = doc(db, "products", id);
    await updateDoc(docRef, {
        is_archived: true,
        archived_at: serverTimestamp(),
    });
}
