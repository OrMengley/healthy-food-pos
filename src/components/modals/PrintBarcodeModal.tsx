"use client";

import { useState, useEffect, useMemo } from "react";
import { Product } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrinterIcon, BarcodeScanIcon, CheckmarkCircle01Icon } from "hugeicons-react";
import JsBarcode from "jsbarcode";

export const LABEL_PRINT_CONFIG = {
  widthMm: 50,
  heightMm: 30,
};

interface PrintBarcodeModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintBarcodeModal({ product, open, onOpenChange }: PrintBarcodeModalProps) {
  const [quantity, setQuantity] = useState<number>(10);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string>("");

  // Generate crisp barcode PNG Data URL
  useEffect(() => {
    if (open && product?.barcode) {
      try {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, product.barcode, {
          format: "CODE128",
          width: 2.2,
          height: 65,
          displayValue: true,
          fontSize: 15,
          font: "monospace",
          margin: 6,
          textMargin: 4,
          background: "#ffffff",
          lineColor: "#000000",
        });
        setBarcodeDataUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Failed to generate barcode data URL", err);
      }
    } else {
      setBarcodeDataUrl("");
    }
  }, [open, product]);

  if (!product) return null;

  const handlePrint = () => {
    if (!barcodeDataUrl) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Generate chosen quantity of barcode-only label cards
    const labelsHtml = Array.from({ length: quantity })
      .map(
        () => `
        <div class="label-card">
          <img src="${barcodeDataUrl}" alt="${product.barcode}" class="barcode-img" />
        </div>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${product.barcode}</title>
          <style>
            @page {
              size: auto;
              margin: 0;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .labels-container {
              display: flex;
              flex-wrap: wrap;
              gap: 2mm;
              padding: 2mm;
              justify-content: flex-start;
              align-content: flex-start;
            }
            .label-card {
              width: ${LABEL_PRINT_CONFIG.widthMm}mm;
              height: ${LABEL_PRINT_CONFIG.heightMm}mm;
              border: 1px dashed #ccc;
              box-sizing: border-box;
              padding: 1.5mm;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .barcode-img {
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              object-fit: contain;
              display: block;
            }
            @media print {
              body {
                padding: 0;
              }
              .labels-container {
                gap: 0;
                padding: 0;
              }
              .label-card {
                border: none;
                page-break-after: always;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="labels-container">
            ${labelsHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <BarcodeScanIcon className="size-5" />
            </div>
            Print Barcode Label
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label Preview Card (Barcode Only) */}
          <div className="flex flex-col items-center justify-center p-5 bg-muted/30 border-2 border-dashed border-border/80 rounded-2xl">
            <div className="flex items-center justify-between w-full max-w-[240px] mb-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              <span>Barcode Preview</span>
              <span>{LABEL_PRINT_CONFIG.widthMm}mm × {LABEL_PRINT_CONFIG.heightMm}mm</span>
            </div>

            {/* Pure Barcode Label Sticker */}
            <div className="bg-white text-black p-3 rounded-xl shadow-md border border-neutral-200 flex flex-col items-center justify-center w-[240px] h-[130px]">
              {barcodeDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={barcodeDataUrl}
                  alt={product.barcode}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex items-center justify-center text-xs text-neutral-400 font-mono">
                  Loading barcode...
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground mt-2.5 font-medium">
              Product: <strong className="text-foreground">{product.name}</strong>
            </p>
          </div>

          {/* Print Guidance Note */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            <span className="font-bold">Thermal Printer tip:</span> In print settings, select <strong>Margins: None</strong> and <strong>Scale: 100% (Actual Size)</strong> for perfect label alignment.
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <Label htmlFor="label-qty" className="font-semibold text-xs text-foreground">
              Number of Copies to Print
            </Label>
            <div className="flex items-center gap-1.5">
              {[1, 5, 10, 20, 50].map((num) => (
                <Button
                  key={num}
                  type="button"
                  size="sm"
                  variant={quantity === num ? "default" : "outline"}
                  onClick={() => setQuantity(num)}
                  className="flex-1 font-bold h-9 rounded-xl text-xs"
                >
                  {num}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Custom amount:</span>
              <Input
                id="label-qty"
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9 w-24 text-center font-bold rounded-xl"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Cancel
          </Button>
          <Button 
            onClick={handlePrint} 
            disabled={!barcodeDataUrl}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md rounded-xl"
          >
            <PrinterIcon className="size-4" />
            Print {quantity} {quantity === 1 ? "Label" : "Labels"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
