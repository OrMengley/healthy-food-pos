"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { adminChangeUserPassword } from "@/lib/firebase/actions";
import { User } from "@/types";
import { LockPasswordIcon, UserIcon } from "hugeicons-react";
import { Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

import { useAuth } from "@/hooks/useAuth";

const formSchema = z
  .object({
    password: z.string().min(6, {
      message: "Password must be at least 6 characters.",
    }),
    confirmPassword: z.string().min(6, {
      message: "Confirm password must be at least 6 characters.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSuccess?: () => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: ChangePasswordDialogProps) {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isSelf = !!user && (
    (currentUser?.id && currentUser.id === user.id) ||
    (currentUser?.uid && currentUser.uid === user.id) ||
    (currentUser?.uid && user.uid && currentUser.uid === user.uid)
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
    onOpenChange(isOpen);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) return;
    setLoading(true);
    try {
      await adminChangeUserPassword(user.id, values.password);
      toast.success(
        isSelf 
          ? "Your password has been changed successfully"
          : `Password for ${user.name} changed successfully`
      );
      form.reset();
      handleClose(false);
      onSuccess?.();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <div className="size-8 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 flex items-center justify-center">
              <LockPasswordIcon className="size-4" />
            </div>
            {isSelf ? "Change Your Password" : `Change Password: ${user.name}`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isSelf
              ? "Set a new login password for your account. You can log in with your username and this new password."
              : `Set a new security password for this ${user.role} account.`}
          </DialogDescription>
        </DialogHeader>

        {/* User preview header */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.name}
              width={36}
              height={36}
              className="size-9 rounded-full object-cover shrink-0 shadow-sm"
            />
          ) : (
            <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm truncate">{user.name}</p>
              {isSelf && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 font-semibold">
                  You
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                {user.role.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {user.username ? `@${user.username}` : user.id}
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pr-10 bg-background"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Confirm New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pr-10 bg-background"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                className="flex-1"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                Update Password
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
