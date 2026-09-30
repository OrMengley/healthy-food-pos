"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User } from "@/types";
import { auth } from "@/lib/firebase/config";
import { updatePassword } from "firebase/auth";

import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Key,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface ChangePasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  isSelf?: boolean;
}

export function ChangePasswordModal({
  open,
  onOpenChange,
  user,
  isSelf = false,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Password strength checker
  const getStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "", color: "bg-muted" };
    if (pass.length < 6) return { score: 1, label: "Weak (min 6 chars)", color: "bg-red-500" };
    const hasNum = /\d/.test(pass);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    const hasUpper = /[A-Z]/.test(pass);
    if (pass.length >= 8 && hasNum && (hasSpecial || hasUpper)) {
      return { score: 3, label: "Strong password", color: "bg-emerald-500" };
    }
    return { score: 2, label: "Medium strength", color: "bg-amber-500" };
  };

  const strength = getStrength(newPassword);

  const resetState = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) resetState();
    onOpenChange(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isSelf) {
        if (auth.currentUser) {
          await updatePassword(auth.currentUser, newPassword);
          toast.success("Password changed successfully!");
        } else {
          toast.error("You must be logged in to change your password.");
        }
      } else if (user) {
        toast.info(`To reset ${user.name}'s password, use Firebase Console -> Authentication.`);
      }
      handleClose(false);
    } catch (error: any) {
      console.error(error);
      if (error.code === "auth/requires-recent-login") {
        toast.error("This operation is sensitive and requires recent login. Please log in again before retrying.");
      } else {
        toast.error(error.message || "Failed to update password.");
      }
    } finally {
      setLoading(false);
    }
  };


  const handleSendResetEmail = async () => {
    // Deprecated for simple auth. This is now handled manually by admin.
    toast.error("Password reset emails are disabled in simple auth mode. Admins can update the password directly.");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
              <Key className="h-5 w-5 text-purple-300" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                {isSelf
                  ? "Change Your Password"
                  : `Change Password for ${user?.name || "User"}`}
              </DialogTitle>
              <DialogDescription className="text-slate-300 text-xs mt-0.5">
                {isSelf
                  ? "Ensure your account is using a strong password"
                  : `Set a new security password or send reset instructions`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* If changing self password */}
          {isSelf && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                Current Password
              </Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10 bg-muted/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              New Password
            </Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10 bg-muted/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password strength meter */}
            {newPassword && (
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${(strength.score / 3) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{strength.label}</p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              Confirm New Password
            </Label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10 bg-muted/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> Passwords do not match
              </p>
            )}
            {confirmPassword && newPassword === confirmPassword && (
              <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" /> Passwords match
              </p>
            )}
          </div>

          {/* Optional: Send Password Reset Email link for Admin mode */}
          {!isSelf && user?.email && (
            <div className="pt-2 border-t text-center">
              <p className="text-xs text-muted-foreground mb-2">Note: Automated reset emails are disabled in simple auth mode.</p>
            </div>
          )}

          <DialogFooter className="pt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={loading || sendingReset}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || sendingReset || (!!newPassword && newPassword !== confirmPassword)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
