"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Settings01Icon,
  Store01Icon,
  Dollar01Icon,
  Invoice01Icon,
  CheckmarkCircle01Icon,
  Loading01Icon,
  Call02Icon,
  Location01Icon,
} from "hugeicons-react";
import { getStoreSettings, updateStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/firebase/settings-actions";
import { StoreSettings } from "@/types";
import { toast } from "sonner";

export default function SettingsPage() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getStoreSettings();
        setSettings(data);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load store settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updateStoreSettings({
        store_name: settings.store_name.trim() || "Healthy Food Store",
        store_phone: settings.store_phone?.trim() || "",
        store_address: settings.store_address?.trim() || "",
        exchange_rate_khr: Number(settings.exchange_rate_khr) || 4100,
        receipt_footer: settings.receipt_footer?.trim() || "",
      });
      toast.success("Store settings saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loading01Icon className="animate-spin size-8 text-primary" />
        <p className="text-sm font-semibold">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 max-w-3xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <Settings01Icon className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight md:text-2xl">Store Settings</h1>
          <p className="text-xs text-muted-foreground">
            Configure your shop name, contact information, currency exchange rate, and receipt footer.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Store Profile Card */}
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="bg-muted/20 border-b pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Store01Icon className="size-5 text-primary" />
              Shop Information
            </CardTitle>
            <CardDescription className="text-xs">
              This information will be printed on customer receipts and displayed in the POS header.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name" className="font-semibold text-sm">
                Store Name *
              </Label>
              <div className="relative">
                <Store01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="store-name"
                  value={settings.store_name}
                  onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                  placeholder="e.g. Healthy Food Store"
                  className="pl-10 h-11 bg-background font-semibold"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="store-phone" className="font-semibold text-sm">
                  Phone Number
                </Label>
                <div className="relative">
                  <Call02Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="store-phone"
                    value={settings.store_phone || ""}
                    onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })}
                    placeholder="e.g. +855 12 345 678"
                    className="pl-10 h-11 bg-background"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-address" className="font-semibold text-sm">
                  Shop Address / Location
                </Label>
                <div className="relative">
                  <Location01Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="store-address"
                    value={settings.store_address || ""}
                    onChange={(e) => setSettings({ ...settings, store_address: e.target.value })}
                    placeholder="e.g. BKK1, Phnom Penh"
                    className="pl-10 h-11 bg-background"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Currency & Exchange Rate Card */}
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="bg-muted/20 border-b pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Dollar01Icon className="size-5 text-emerald-600" />
              Currency & Exchange Rate
            </CardTitle>
            <CardDescription className="text-xs">
              All prices are stored in USD. Enter the exchange rate to calculate Khmer Riel (៛) in the POS and receipts.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exchange-rate" className="font-semibold text-sm">
                Exchange Rate (KHR per 1 USD) *
              </Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    1 USD =
                  </span>
                  <Input
                    id="exchange-rate"
                    type="number"
                    min="1000"
                    max="10000"
                    step="10"
                    value={settings.exchange_rate_khr}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        exchange_rate_khr: parseInt(e.target.value) || 4100,
                      })
                    }
                    className="pl-16 pr-12 h-11 bg-background font-bold text-base"
                    required
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    KHR (៛)
                  </span>
                </div>

                <div className="flex gap-1.5">
                  {[4000, 4100, 4150].map((rate) => (
                    <Button
                      key={rate}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings({ ...settings, exchange_rate_khr: rate })}
                      className="h-11 px-3 text-xs font-bold"
                    >
                      {rate.toLocaleString()} ៛
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Customization Card */}
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="bg-muted/20 border-b pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Invoice01Icon className="size-5 text-primary" />
              Receipt Footer Note
            </CardTitle>
            <CardDescription className="text-xs">
              Custom greeting or thank you note printed at the bottom of customer receipts.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label htmlFor="receipt-footer" className="font-semibold text-sm">
                Footer Message
              </Label>
              <Textarea
                id="receipt-footer"
                rows={3}
                value={settings.receipt_footer || ""}
                onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
                placeholder="e.g. Thank you for choosing healthy food! Wishing you good health."
                className="bg-background"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-12 bg-primary hover:bg-primary/90 font-bold text-base shadow-md uppercase tracking-wide gap-2"
        >
          {saving ? (
            <Loading01Icon className="animate-spin size-5" />
          ) : (
            <CheckmarkCircle01Icon className="size-5" />
          )}
          Save Store Settings
        </Button>
      </form>
    </div>
  );
}
