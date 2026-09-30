"use client";

import { useEffect, useState } from "react";
import { SaleInvoice, StoreSettings } from "@/types";
import { getStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PrinterIcon, CheckmarkCircle01Icon } from "hugeicons-react";
import { format } from "date-fns";
import { formatCambodiaDate } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface ReceiptModalProps {
  invoice: SaleInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptModal({ invoice, open, onOpenChange }: ReceiptModalProps) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

  useEffect(() => {
    if (open) {
      getStoreSettings().then(setSettings);
    }
  }, [open]);

  if (!invoice) return null;

  const rate = invoice.exchange_rate_khr || settings.exchange_rate_khr || 4100;
  const totalUsd = Number(invoice.total_price || 0).toFixed(2);
  const totalKhr = Math.round(Number(invoice.total_price || 0) * rate).toLocaleString();
  const subTotalUsd = Number(invoice.sub_total || 0).toFixed(2);
  const discountUsd = Number(invoice.discount || 0).toFixed(2);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsHtml = invoice.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 3px 0;">
            <div style="font-weight: bold; font-size: 11px;">${item.product_name}</div>
            <div style="font-size: 10px; color: #555;">${item.quantity} x $${Number(item.price).toFixed(2)} ${item.discount ? `(-$${Number(item.discount).toFixed(2)})` : ""}</div>
          </td>
          <td style="text-align: right; font-weight: bold; font-size: 11px; vertical-align: top; padding: 3px 0;">
            $${Number(item.total_price).toFixed(2)}
          </td>
        </tr>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${invoice.invoice_number || invoice.id}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Khmer OS", sans-serif;
              width: 72mm;
              margin: 0 auto;
              padding: 4px;
              color: #000;
              font-size: 11px;
            }
            .header {
              text-align: center;
              margin-bottom: 8px;
            }
            .store-title {
              font-size: 14px;
              font-weight: 900;
              text-transform: uppercase;
              margin-bottom: 2px;
            }
            .store-meta {
              font-size: 9px;
              color: #444;
              line-height: 1.2;
            }
            .divider {
              border-top: 1px dashed #444;
              margin: 6px 0;
            }
            .meta-grid {
              font-size: 10px;
              line-height: 1.3;
              margin-bottom: 6px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 4px 0;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 2px 0;
              font-size: 11px;
            }
            .grand-total {
              font-size: 14px;
              font-weight: 900;
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
              padding: 4px 0;
              margin: 4px 0;
            }
            .footer {
              text-align: center;
              font-size: 9px;
              color: #555;
              margin-top: 10px;
              padding-top: 6px;
              border-top: 1px dashed #444;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-title">${settings.store_name || "HEALTHY FOOD STORE"}</div>
            <div class="store-meta">${settings.store_address || ""}</div>
            ${settings.store_phone ? `<div class="store-meta">Tel: ${settings.store_phone}</div>` : ""}
          </div>

          <div class="divider"></div>

          <div class="meta-grid">
            <div class="meta-row">
              <span>Invoice: <strong>${invoice.invoice_number || invoice.id}</strong></span>
              <span>${formatCambodiaDate(invoice.created_at, "invoice")}</span>
            </div>
            <div class="meta-row">
              <span>Customer: <strong>${invoice.customer_name || (invoice.customer_type === "online" ? "Online Customer" : "Walk-in Customer")}</strong></span>
              <span style="text-transform: uppercase; font-weight: bold; color: ${invoice.customer_type === "online" ? "#2563eb" : "#059669"};">[${invoice.customer_type === "online" ? "ONLINE" : "WALK-IN"}]</span>
            </div>
            ${invoice.customer_phone ? `
            <div class="meta-row">
              <span>Phone: <strong>${invoice.customer_phone}</strong></span>
            </div>` : ""}
            <div class="meta-row">
              <span>Cashier: ${invoice.created_by_name || "Admin"}</span>
              <span style="text-transform: uppercase; font-weight: bold;">[${invoice.payment_method}]</span>
            </div>
          </div>

          <div class="divider"></div>

          <table>
            ${itemsHtml}
          </table>

          <div class="divider"></div>

          <div class="totals-row">
            <span>Subtotal:</span>
            <span>$${subTotalUsd}</span>
          </div>
          ${Number(invoice.discount || 0) > 0 ? `
            <div class="totals-row" style="color: #c00;">
              <span>Discount:</span>
              <span>-$${discountUsd}</span>
            </div>
          ` : ""}
          <div class="totals-row grand-total">
            <span>TOTAL (USD):</span>
            <span>$${totalUsd}</span>
          </div>
          <div class="totals-row" style="font-weight: bold; font-size: 12px;">
            <span>TOTAL (KHR):</span>
            <span>${totalKhr} ៛</span>
          </div>

          <div class="footer">
            <div>${settings.receipt_footer || "Thank you for eating healthy!"}</div>
            <div style="margin-top: 4px; font-size: 8px;">Rate: 1 USD = ${rate.toLocaleString()} KHR</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 300);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 bg-emerald-500/10 border-b flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-emerald-800">
            <CheckmarkCircle01Icon className="size-5 text-emerald-600" />
            Receipt #{invoice.invoice_number || invoice.id}
          </DialogTitle>
        </DialogHeader>

        {/* Receipt Paper View */}
        <div className="p-6 bg-white text-black font-sans text-xs space-y-4">
          <div className="text-center space-y-0.5">
            <h3 className="font-black text-base uppercase tracking-wider text-neutral-900">
              {settings.store_name || "HEALTHY FOOD STORE"}
            </h3>
            {settings.store_address && (
              <p className="text-[10px] text-neutral-500">{settings.store_address}</p>
            )}
            {settings.store_phone && (
              <p className="text-[10px] text-neutral-500">Tel: {settings.store_phone}</p>
            )}
          </div>

          <Separator className="border-dashed" />

          <div className="grid grid-cols-2 text-[11px] gap-1 text-neutral-600">
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Invoice #</span>
              <span className="font-mono font-bold text-neutral-900">{invoice.invoice_number || invoice.id}</span>
            </div>
            <div className="text-right">
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Date & Time (ICT)</span>
              <span className="text-neutral-900">{formatCambodiaDate(invoice.created_at, "datetime")}</span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Customer</span>
              <span className="text-neutral-900 font-semibold truncate block">
                {invoice.customer_name || (invoice.customer_type === "online" ? "Online Customer" : "Walk-in Customer")}
                {invoice.customer_phone ? ` (${invoice.customer_phone})` : ""}
              </span>
            </div>
            <div className="text-right">
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Type / Channel</span>
              <span className={`font-bold uppercase text-[10px] ${invoice.customer_type === "online" ? "text-blue-600" : "text-emerald-700"}`}>
                {invoice.customer_type === "online" ? "Online Order" : "Walk-in"}
              </span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Cashier</span>
              <span className="text-neutral-900 font-medium">{invoice.created_by_name || "Admin"}</span>
            </div>
            <div className="text-right">
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Payment</span>
              <span className="font-bold text-emerald-700 uppercase">{invoice.payment_method}</span>
            </div>
          </div>

          <Separator className="border-dashed" />

          {/* Items */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start text-xs">
                <div>
                  <p className="font-bold text-neutral-900">{item.product_name}</p>
                  <p className="text-[10px] text-neutral-500">
                    {item.quantity} x ${Number(item.price).toFixed(2)}
                    {item.discount ? ` (-$${Number(item.discount).toFixed(2)})` : ""}
                  </p>
                </div>
                <span className="font-bold text-neutral-900">${Number(item.total_price).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <Separator className="border-dashed" />

          {/* Totals */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal:</span>
              <span>${subTotalUsd}</span>
            </div>
            {Number(invoice.discount || 0) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount:</span>
                <span>-${discountUsd}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-base font-black border-t border-neutral-300 pt-2 text-neutral-900">
              <span>TOTAL (USD):</span>
              <span className="text-emerald-700">${totalUsd}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold text-neutral-700">
              <span>TOTAL (KHR):</span>
              <span>{totalKhr} ៛</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-neutral-400 pt-2 border-t border-dashed">
            {settings.receipt_footer || "Thank you for eating healthy!"}
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/40 border-t gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-2 bg-primary hover:bg-primary/90 font-bold shadow-md">
            <PrinterIcon className="size-4" />
            Print Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
