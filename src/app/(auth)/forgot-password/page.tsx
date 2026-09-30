"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import Image from "next/image";
import loginImg from "@/img/login/login.jpg";

export default function ForgotPasswordPage() {
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successEmail, setSuccessEmail] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let targetEmail = inputVal.trim();

      // If username was entered, lookup email in Firestore
      if (!targetEmail.includes("@")) {
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        const usersRef = collection(db, "users");
        let q = query(usersRef, where("username", "==", targetEmail));
        let snapshot = await getDocs(q);

        if (snapshot.empty) {
          q = query(usersRef, where("username", "==", targetEmail.toLowerCase()));
          snapshot = await getDocs(q);
        }

        if (snapshot.empty) {
          throw new Error(`No account found with username "${targetEmail}".`);
        }

        const data = snapshot.docs[0].data();
        if (!data.email) {
          throw new Error(`No email address associated with user "${targetEmail}".`);
        }
        targetEmail = data.email;
      }

      await sendPasswordResetEmail(auth, targetEmail);
      setSuccessEmail(targetEmail);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email address.");
      } else {
        setError(err.message || "Failed to send password reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen lg:grid lg:grid-cols-2 bg-background">
      <div className="flex items-center justify-center py-12 px-4">
        <div className="mx-auto grid w-[380px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Reset Password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your account email or username to receive a password reset link
            </p>
          </div>

          {successEmail ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-emerald-900 dark:text-emerald-200 text-base">
                  Reset link sent!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  We&apos;ve sent a password reset email to:
                </p>
                <p className="text-xs font-mono font-bold text-emerald-900 dark:text-emerald-100">
                  {successEmail}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground pt-2">
                Please check your inbox (and spam folder) for instructions to create a new password.
              </p>
              <Link href="/login" className="block pt-2">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Login
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="grid gap-4">
              {error && (
                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                  {error}
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="inputVal">Email or Username</Label>
                <div className="relative">
                  <Input
                    id="inputVal"
                    type="text"
                    placeholder="john@example.com or johndoe"
                    required
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    className="pl-10"
                  />
                  <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {loading ? "Sending link..." : "Send Reset Link"}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="relative hidden bg-emerald-950 lg:flex items-center justify-center overflow-hidden">
        <Image
          src={loginImg}
          alt="Healthy Food POS"
          fill
          priority
          className="object-cover opacity-60"
        />
        <div className="relative z-10 flex flex-col items-center justify-center p-8 text-white bg-black/50 backdrop-blur-xs w-full h-full text-center">
          <h1 className="text-4xl font-black tracking-wider text-emerald-400">
            HEALTHY FOOD POS
          </h1>
          <p className="text-sm text-zinc-200 mt-2 font-medium max-w-sm">
            Single-Store Counter POS & Inventory Stock Management
          </p>
        </div>
      </div>
    </div>
  );
}
