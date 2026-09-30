import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewMovementPage() {
  return (
    <div className="mx-auto grid w-full max-w-[600px] gap-6 mt-10">
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold">New Inventory Movement</h1>
        <p className="text-muted-foreground">
          Record stock in, stock out, or adjustments.
        </p>
      </div>
      <div className="grid gap-4 border p-6 rounded-lg shadow-sm">
        <div className="grid gap-2">
            <Label>Type</Label>
            <Select>
                <SelectTrigger>
                    <SelectValue placeholder="Select movement type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="stock_in">Stock In (Purchase)</SelectItem>
                    <SelectItem value="stock_out">Stock Out (Sale)</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <div className="grid gap-2">
            <Label>Product</Label>
            <Input placeholder="Scan barcode or search product..." />
        </div>
        <div className="grid gap-2">
            <Label>Quantity</Label>
            <Input type="number" placeholder="0" />
        </div>
        <div className="grid gap-2">
            <Label>Reference / Note</Label>
            <Input placeholder="Optional note" />
        </div>
        <Button className="mt-4">Submit Movement</Button>
      </div>
    </div>
  );
}
