"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/firebase/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import Image from "next/image";
import loginImg from "@/img/login/login.jpg";

export default function LoginPage() {
  const { user, loading: authLoading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("remember_me");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.username) setUsername(parsed.username);
        if (parsed?.password) setPassword(parsed.password);
        setRememberMe(true);
      }
    } catch (e) {
      console.error("Failed to load saved credentials", e);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && !loading) {
      router.replace(user.role === "staff" ? "/pos" : "/");
    }
  }, [user, authLoading, router, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const loggedInUser = await loginUser(username, password);

      if (loggedInUser.is_archived) {
        throw new Error("Your account has been archived. Please contact an administrator.");
      }

      if (rememberMe) {
        localStorage.setItem(
          "remember_me",
          JSON.stringify({ username: username, password: password })
        );
      } else {
        localStorage.removeItem("remember_me");
      }

      login(loggedInUser);
      router.push(loggedInUser.role === "staff" ? "/pos" : "/");
    } catch (err: any) {
      console.error("Login error details:", err);
      setError(err.message || "Failed to login. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen lg:grid lg:grid-cols-2">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-black text-primary tracking-tight">Healthy Food POS</h1>
            <p className="text-balance text-muted-foreground text-xs">
              Sign in to your counter register or admin dashboard
            </p>
          </div>
          <form onSubmit={handleLogin} className="grid gap-4">
            {error && (
              <Alert
                variant="destructive"
                className="border-red-200/60 bg-red-50/80 text-red-600 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-red-100/30 blur-xl pointer-events-none" />
                <AlertCircle className="h-4 w-4 mt-0.5 text-red-500" />
                <AlertTitle className="font-semibold tracking-tight text-red-700">Login Failed</AlertTitle>
                <AlertDescription className="text-sm text-red-600/90 leading-relaxed font-medium">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="username" className="font-semibold text-xs">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder=""
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setRememberMe(isChecked);
                    if (!isChecked) {
                      localStorage.removeItem("remember_me");
                    }
                  }}
                />
                <Label
                  htmlFor="remember-me"
                  className="text-sm font-normal text-muted-foreground cursor-pointer select-none"
                >
                  Remember me
                </Label>
              </div>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 font-bold" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
      <div className="relative hidden bg-zinc-950 lg:flex items-end justify-start overflow-hidden p-12">
        <Image
          src={loginImg}
          alt="Healthy Food POS"
          fill
          priority
          className="object-cover brightness-[0.88] hover:scale-105 transition-transform duration-1000 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 pointer-events-none" />

        <div className="relative z-10 max-w-lg space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/60 px-3.5 py-1.5 backdrop-blur-md shadow-lg shadow-black/20">
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold tracking-wider text-emerald-300 uppercase">
              Fresh Food & Counter POS
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl leading-tight drop-shadow-md">
            HEALTHY FOOD <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200">
              POS SYSTEM
            </span>
          </h1>

          <p className="text-sm text-zinc-200/90 font-medium leading-relaxed drop-shadow">
            Single-Store Counter POS, real-time sales invoicing, and complete inventory stock management tailored for healthy food stores.
          </p>
        </div>
      </div>
    </div>
  );
}
