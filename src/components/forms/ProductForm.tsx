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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createProduct, getCategories, updateProduct } from "@/lib/firebase/actions";
import { generateNextBarcode } from "@/lib/firebase/barcode-actions";
import { useEffect, useState } from "react";
import { 
  Loading01Icon, 
  ImageAdd01Icon, 
  Delete01Icon,
  Package01Icon,
  BarcodeScanIcon,
  Dollar01Icon,
  TagsIcon,
  Image01Icon,
  Refresh01Icon,
  CheckmarkCircle01Icon,
  SparklesIcon,
  FileEditIcon,
} from "hugeicons-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Category, Product } from "@/types";
import Image from "next/image";
import { buildImageUrl } from "cloudinary-build-url";
import imageCompression from "browser-image-compression";
import type Heic2AnyType from "heic2any";
import { getOptimizedImageUrl } from "@/lib/utils";

/**
 * Resizes and compresses product images before upload to Cloudinary.
 * If image pixel dimensions > 500px, it limits it to max 500x500px to save cloud storage and bandwidth.
 */
async function resizeProductImageForCloudinary(file: File): Promise<File> {
  // 1. Try with browser-image-compression
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      initialQuality: 0.85,
      fileType: "image/jpeg",
    });
    const outputName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
    return new File([compressed], outputName, { type: "image/jpeg" });
  } catch (compErr) {
    console.warn("browser-image-compression fallback to canvas:", compErr);
  }

  // 2. Fallback using HTML5 Canvas to guarantee maximum 500px x 500px bounds
  return new Promise<File>((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      const maxDim = 500;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const outputName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            resolve(new File([blob], outputName, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "il9ikkuq";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "ml_default"; 

const formSchema = z.object({
  name: z.string().min(2, { message: "Product name is required (at least 2 characters)." }),
  barcode: z.string().min(1, { message: "Barcode is required." }),
  price: z.coerce.number().min(0.01, "Selling price must be greater than 0."),
  cost: z.coerce.number().min(0, "Cost price must be 0 or greater.").optional().default(0),
  category_id: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  description: z.string().optional(),
  images: z.array(z.string()).default([]),
  thumbnails: z.array(z.string()).default([]),
});

type ProductFormValues = z.infer<typeof formSchema>;

interface ProductFormProps {
  initialData?: Product;
  exchangeRateKhr?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ProductForm({ 
  initialData, 
  exchangeRateKhr = 4100, 
  onSuccess,
  onCancel 
}: ProductFormProps) {
  const [loading, setLoading] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uploading, setUploading] = useState(false);

  const isEditing = Boolean(initialData?.id);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      barcode: initialData?.barcode || "",
      price: initialData?.price || 0,
      cost: initialData?.cost || initialData?.cost_recommand || 0,
      category_id: initialData?.category_id || "",
      status: initialData?.status || "active",
      description: initialData?.description || "",
      images: initialData?.images || [],
      thumbnails: initialData?.thumbnails || [],
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || "",
        barcode: initialData.barcode || "",
        price: initialData.price || 0,
        cost: initialData.cost || initialData.cost_recommand || 0,
        category_id: initialData.category_id || "",
        status: initialData.status || "active",
        description: initialData.description || "",
        images: initialData.images || [],
        thumbnails: initialData.thumbnails || [],
      });
    } else {
      form.reset({
        name: "",
        barcode: "",
        price: 0,
        cost: 0,
        category_id: "",
        status: "active",
        description: "",
        images: [],
        thumbnails: [],
      });
    }
  }, [initialData, form]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await getCategories();
        setCategories(data.filter(c => c.status !== "inactive" || c.id === initialData?.category_id));
      } catch (err) {
        console.error("Failed to load categories", err);
      }
    }
    loadCategories();
  }, [initialData]);

  const handleGenerateBarcode = async () => {
    try {
      setGeneratingBarcode(true);
      const newBarcode = await generateNextBarcode();
      form.setValue("barcode", newBarcode, { shouldValidate: true });
      toast.success(`Generated sequential barcode: ${newBarcode}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate barcode. Please try again.");
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const images = form.watch("images") || [];
  const thumbnails = form.watch("thumbnails") || [];
  const currentPrice = Number(form.watch("price")) || 0;
  const currentCost = Number(form.watch("cost")) || 0;

  // Profit calculation preview based on recommend prices
  const profit = currentPrice - currentCost;
  const profitMargin = currentPrice > 0 ? ((profit / currentPrice) * 100).toFixed(1) : "0";
  const priceInKhr = Math.round(currentPrice * exchangeRateKhr);
  const costInKhr = Math.round(currentCost * exchangeRateKhr);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 5) {
      toast.error("Maximum 5 photos allowed per product.");
      return;
    }

    setUploading(true);
    const uploadedImages: string[] = [...images];
    const uploadedThumbnails: string[] = [...thumbnails];

    try {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        
        const fileName = file.name;
        const extension = fileName.split(".").pop()?.toLowerCase();
        const isHEIC = extension === "heic" || extension === "heif" ||
                       file.type === "image/heic" || file.type === "image/heif";

        let isConverted = false;

        if (isHEIC) {
          const conversionToastId = toast.loading(`Converting HEIC image (${file.name})...`);
          try {
            const heic2any = (await import("heic2any")).default as typeof Heic2AnyType;
            const blobForConversion = file.slice(0, file.size, file.type);
            const convertedBlob = await heic2any({
              blob: blobForConversion,
              toType: "image/jpeg",
              quality: 0.8
            });
            const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            const newFileName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
            file = new File([resultBlob], newFileName, { type: "image/jpeg" });
            isConverted = true;
            toast.success(`Converted ${file.name} to JPG`, { id: conversionToastId });
          } catch (convError: any) {
            toast.error(`Could not convert ${file.name}. Uploading original.`, { id: conversionToastId });
          }
        }

        // Limit image to max 500px x 500px before uploading to Cloudinary
        file = await resizeProductImageForCloudinary(file);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("folder", "healthy-food-pos/products");
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Upload failed");
        }

        const data = await response.json();
        const imageUrl = data.secure_url;
        
        const thumbnailUrl = buildImageUrl(data.public_id, {
          cloud: {
            cloudName: CLOUDINARY_CLOUD_NAME,
          },
          transformations: {
            resize: {
              type: "thumb",
              width: 250,
              height: 250,
              gravity: "auto"
            },
            format: "webp",
            quality: "auto"
          },
        });

        uploadedImages.push(imageUrl);
        uploadedThumbnails.push(thumbnailUrl);
      }

      form.setValue("images", uploadedImages);
      form.setValue("thumbnails", uploadedThumbnails);
      toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} uploaded successfully`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to upload photo(s).");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...images];
    const newThumbnails = [...thumbnails];
    newImages.splice(index, 1);
    newThumbnails.splice(index, 1);
    form.setValue("images", newImages);
    form.setValue("thumbnails", newThumbnails);
  };

  const handleReset = () => {
    form.reset({
      name: "",
      barcode: "",
      price: 0,
      cost: 0,
      category_id: "",
      status: "active",
      description: "",
      images: [],
      thumbnails: [],
    });
    if (onCancel) onCancel();
  };

  async function onSubmit(values: ProductFormValues) {
    setLoading(true);
    try {
      const payload = {
        name: values.name.trim(),
        barcode: values.barcode.trim(),
        price: Number(values.price) || 0,
        cost: Number(values.cost) || 0,
        cost_recommand: Number(values.cost) || 0,
        category_id: values.category_id === "none" || !values.category_id ? undefined : values.category_id,
        status: values.status,
        description: values.description?.trim() || "",
        images: values.images,
        thumbnails: values.thumbnails,
      };

      if (initialData?.id) {
        await updateProduct(initialData.id, payload);
        toast.success(`Product "${payload.name}" updated successfully`);
      } else {
        await createProduct(payload, 0);
        toast.success(`Product "${payload.name}" created successfully`);
      }
      
      if (!isEditing) {
        form.reset({
          name: "",
          barcode: "",
          price: 0,
          cost: 0,
          category_id: "",
          status: "active",
          description: "",
          images: [],
          thumbnails: [],
        });
      }
      onSuccess?.();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || (initialData?.id ? "Failed to update product" : "Failed to create product"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4 lg:p-5">
        
        {/* ─── Mode Banner if Editing ─── */}
        {isEditing && (
          <div className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="font-semibold">Editing: <strong>{initialData?.name}</strong></span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-6 px-2 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
            >
              Cancel Edit
            </Button>
          </div>
        )}

        {/* ─── 1. General Product Details ─── */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <div className="p-1 rounded-md bg-primary/10 text-primary">
                <SparklesIcon className="size-3.5" />
              </div>
              General Information
            </div>

            {/* Status Selector */}
            <FormField<ProductFormValues, "status">
              control={form.control}
              name="status"
              render={({ field }) => (
                <div className="flex items-center gap-1.5">
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-7 text-xs font-semibold px-2.5 border-border/80 bg-muted/40 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active" className="text-xs font-medium text-emerald-600">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-emerald-500" />
                          <span>Active</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="inactive" className="text-xs font-medium text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-neutral-400" />
                          <span>Inactive</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>

          {/* Product Name */}
          <FormField<ProductFormValues, "name">
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <Package01Icon className="size-3.5 text-primary" />
                  Product Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Avocado Salmon Grain Bowl"
                    className="h-10 text-sm font-medium bg-background rounded-xl border-border/80 focus-visible:ring-primary/20"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          {/* Barcode & Auto Generate */}
          <FormField<ProductFormValues, "barcode">
            control={form.control}
            name="barcode"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <BarcodeScanIcon className="size-3.5 text-primary" />
                    Barcode (Code 128) <span className="text-destructive">*</span>
                  </FormLabel>
                  <span className="text-[10px] text-muted-foreground font-mono">HF-XXXXXX</span>
                </div>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="e.g. HF-000001"
                      className="h-10 text-sm font-mono font-bold tracking-wider bg-background uppercase rounded-xl border-border/80 focus-visible:ring-primary/20"
                      {...field}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generatingBarcode}
                    onClick={handleGenerateBarcode}
                    className="h-10 px-3 shrink-0 font-bold text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary rounded-xl transition-all shadow-2xs"
                    title="Auto-generate sequential barcode"
                  >
                    {generatingBarcode ? (
                      <Loading01Icon className="size-3.5 animate-spin" />
                    ) : (
                      <Refresh01Icon className="size-3.5" />
                    )}
                    <span>Auto Code</span>
                  </Button>
                </div>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField<ProductFormValues, "category_id">
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <TagsIcon className="size-3.5 text-primary" />
                  Category
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "none"}>
                  <FormControl>
                    <SelectTrigger className="h-10 text-xs font-semibold bg-background rounded-xl border-border/80 focus:ring-primary/20">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="none" className="text-xs font-medium text-muted-foreground">
                      Uncategorized
                    </SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs font-medium">
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* ─── 2. Recommended Pricing ─── */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Dollar01Icon className="size-3.5" />
                </div>
                <span>Recommended Pricing</span>
              </div>
            </div>
            
            {/* Profit Margin Preview */}
            {currentPrice > 0 && (
              <Badge 
                variant="outline" 
                className={`text-[10px] px-2 py-0.5 font-bold tracking-tight rounded-full transition-all ${
                  profit >= 0
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                }`}
              >
                {profit >= 0 ? `Margin ~${profitMargin}% (+$${profit.toFixed(2)})` : `Loss (-$${Math.abs(profit).toFixed(2)})`}
              </Badge>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground -mt-1 leading-relaxed">
            Standard reference prices. Cost per unit is flexible during stock purchase, and selling price is flexible during sales checkout.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Recommend Selling Price */}
            <FormField<ProductFormValues, "price">
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-bold text-foreground flex flex-col gap-0.5">
                    <span>Selling Price ($) <span className="text-destructive">*</span></span>
                    <span className="text-[10px] font-normal text-muted-foreground">Recommend per unit</span>
                  </FormLabel>
                  <div className="flex items-center h-10 rounded-xl border border-border/80 bg-background overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all shadow-2xs">
                    <div className="h-full px-3 flex items-center justify-center bg-muted/40 border-r border-border/70 text-emerald-600 dark:text-emerald-400 font-bold text-sm select-none shrink-0">
                      $
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="h-full border-0 bg-transparent rounded-none px-3 text-sm font-bold text-emerald-700 dark:text-emerald-300 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <div className="min-h-[16px]">
                    {currentPrice > 0 && (
                      <p className="text-[10px] text-muted-foreground font-medium pl-1">
                        ≈ {priceInKhr.toLocaleString()} ៛
                      </p>
                    )}
                  </div>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {/* Recommend Cost Price */}
            <FormField<ProductFormValues, "cost">
              control={form.control}
              name="cost"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground flex flex-col gap-0.5">
                    <span>Cost Price ($)</span>
                    <span className="text-[10px] font-normal text-muted-foreground">Recommend per unit</span>
                  </FormLabel>
                  <div className="flex items-center h-10 rounded-xl border border-border/80 bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-2xs">
                    <div className="h-full px-3 flex items-center justify-center bg-muted/40 border-r border-border/70 text-muted-foreground font-bold text-sm select-none shrink-0">
                      $
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="h-full border-0 bg-transparent rounded-none px-3 text-sm font-semibold text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <div className="min-h-[16px]">
                    {currentCost > 0 && (
                      <p className="text-[10px] text-muted-foreground font-medium pl-1">
                        ≈ {costInKhr.toLocaleString()} ៛
                      </p>
                    )}
                  </div>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* ─── 3. Description (Optional) ─── */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/60 pb-2">
            <div className="p-1 rounded-md bg-muted text-muted-foreground">
              <FileEditIcon className="size-3.5" />
            </div>
            Description & Notes
            <span className="text-[10px] font-normal text-muted-foreground ml-auto">Optional</span>
          </div>
          <FormField<ProductFormValues, "description">
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="e.g. Ingredients, calories, dressing options, allergens, or dietary info..."
                    className="min-h-[70px] text-xs bg-background rounded-xl border-border/80 resize-none focus-visible:ring-primary/20"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* ─── 4. Product Media Gallery ─── */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <div className="p-1 rounded-md bg-primary/10 text-primary">
                <Image01Icon className="size-3.5" />
              </div>
              Product Photos
            </div>
            <span className="text-[11px] font-mono text-muted-foreground font-semibold">
              {images.length} / 5 photos
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {/* Upload Trigger Button */}
            {images.length < 5 && (
              <label className="aspect-square rounded-xl border-2 border-dashed border-primary/30 hover:border-primary flex flex-col items-center justify-center gap-1 cursor-pointer bg-background hover:bg-primary/5 transition-all group overflow-hidden shadow-2xs">
                {uploading ? (
                  <Loading01Icon className="size-5 animate-spin text-primary" />
                ) : (
                  <>
                    <ImageAdd01Icon className="size-5 text-primary/70 group-hover:text-primary transition-transform group-hover:scale-110" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary/80">
                      Upload
                    </span>
                  </>
                )}
                <input
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleImageUpload}
                />
              </label>
            )}

            {/* Uploaded Photos Thumbnails */}
            {images.map((url, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-xl overflow-hidden border border-border/80 bg-muted/30 group shadow-xs hover:ring-2 hover:ring-primary/60 transition-all"
              >
                <Image 
                  src={getOptimizedImageUrl(url, 150, 150)} 
                  alt="Product preview" 
                  fill 
                  className="object-cover" 
                  sizes="120px"
                />
                {index === 0 && (
                  <div className="absolute top-1 left-1 bg-black/75 backdrop-blur-xs text-[8px] text-white font-bold px-1.5 py-0.5 rounded shadow-xs">
                    Cover
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="bg-destructive text-destructive-foreground p-1.5 rounded-full hover:bg-destructive/90 shadow-md transition-transform scale-90 hover:scale-105"
                    title="Remove photo"
                  >
                    <Delete01Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Submit & Action Buttons ─── */}
        <div className="flex items-center gap-2 pt-1 sticky bottom-0 bg-card/90 backdrop-blur-xs py-2">
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="h-11 px-4 font-bold text-xs rounded-xl border-border/80 shrink-0"
            >
              Cancel
            </Button>
          )}

          <Button
            type="submit"
            disabled={loading || uploading}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider shadow-md rounded-xl transition-all"
          >
            {loading ? (
              <Loading01Icon className="animate-spin size-4 mr-2" />
            ) : (
              <CheckmarkCircle01Icon className="size-4 mr-2" />
            )}
            {isEditing ? "Update Product Details" : "Save Healthy Food Product"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
