"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { createWarehouse, updateWarehouse } from "@/lib/firebase/warehouse-actions";
import { useState, useEffect } from "react";
import { Loader2, Home, MapPin, Phone, Sparkles, PencilLine } from "lucide-react";
import { Warehouse } from "@/types";

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  address: z.string().optional(),
  phone: z.string().optional(),
});

interface WarehouseFormProps {
  onSuccess?: () => void;
  initialData?: Warehouse;
}

export function WarehouseForm({ onSuccess, initialData }: WarehouseFormProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!initialData;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      address: initialData?.address || "",
      phone: initialData?.phone || "",
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        address: initialData.address || "",
        phone: initialData.phone || "",
      });
    }
  }, [initialData, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      if (isEditing && initialData) {
        await updateWarehouse(initialData.id, values);
        toast.success("Warehouse updated successfully");
      } else {
        await createWarehouse(values);
        toast.success("Warehouse created successfully");
        form.reset();
      }
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(isEditing ? "Failed to update warehouse" : "Failed to create warehouse");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/50 space-y-4">
          <div className="flex items-center gap-2 text-blue-600 font-medium text-sm mb-2">
            <Home className="h-4 w-4" />
            General Information
          </div>
          
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Warehouse Name
                </FormLabel>
                <FormControl>
                  <Input placeholder="Main Warehouse" className="bg-background/50 border-blue-100 focus-visible:ring-blue-500" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Address
                </FormLabel>
                <FormControl>
                  <Input placeholder="123 Street, City" className="bg-background/50 border-blue-100 focus-visible:ring-blue-500" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Number
                </FormLabel>
                <FormControl>
                  <Input placeholder="+855 ..." className="bg-background/50 border-blue-100 focus-visible:ring-blue-500" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-lg shadow-blue-500/20">
          {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : (isEditing ? <PencilLine className="h-5 w-5 mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />)}
          <span className="font-semibold tracking-wide uppercase">
            {isEditing ? "Update Warehouse" : "Create Warehouse"}
          </span>
        </Button>
      </form>
    </Form>
  );
}
