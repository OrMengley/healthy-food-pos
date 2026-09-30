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
import { useState } from "react";
import { Loading01Icon, TagsIcon, MagicWand01Icon, CheckmarkCircle01Icon } from "hugeicons-react";
import { createCategory, updateCategory } from "@/lib/firebase/actions";
import { Category } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Category name must be at least 2 characters.",
  }),
  status: z.enum(["active", "inactive"]).default("active"),
});

type CategoryFormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  initialData?: Category;
  onSuccess?: () => void;
}

export function CategoryForm({ initialData, onSuccess }: CategoryFormProps) {
  const [loading, setLoading] = useState(false);
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      status: initialData?.status || "active",
    },
  });

  async function onSubmit(values: CategoryFormValues) {
    setLoading(true);
    try {
      if (initialData?.id) {
        await updateCategory(initialData.id, {
          name: values.name.trim(),
          status: values.status,
        });
        toast.success("Category updated successfully");
      } else {
        await createCategory({
          name: values.name.trim(),
          status: values.status,
        });
        toast.success("Category created successfully");
      }
      form.reset();
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(initialData?.id ? "Failed to update category" : "Failed to create category");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-4 shadow-sm">
          <div className="flex items-center justify-between text-primary font-bold text-base mb-2">
            <div className="flex items-center gap-2">
              <TagsIcon className="h-5 w-5" />
              Category Details
            </div>
          </div>
          
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-foreground">Category Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g. Smoothies, Salad Bowls, Cold Pressed..." 
                    className="h-11 bg-background border-primary/20 focus-visible:ring-primary text-base" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold text-foreground">Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-11 bg-background border-primary/20 focus:ring-primary">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button 
          type="submit" 
          disabled={loading} 
          className="w-full h-11 bg-primary hover:bg-primary/90 transition-all duration-300 shadow-md font-bold text-sm tracking-wide uppercase"
        >
          {loading ? <Loading01Icon className="animate-spin h-5 w-5 mr-2" /> : <CheckmarkCircle01Icon className="h-5 w-5 mr-2" />}
          {initialData ? "Update Category" : "Create Category"}
        </Button>
      </form>
    </Form>
  );
}
