"use client";
import { Minus, Plus } from "lucide-react";
import type { CartItem } from "@/types";
import { useStore } from "@/store/use-store";
export function Quantity({ item }: { item: CartItem }) {
  const quantity = useStore((s) => s.quantity);
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={`Remove one ${item.name}`}
        onClick={() => quantity(item.key, -1)}
      >
        <Minus size={14} />
      </button>
      <span>{item.quantity}</span>
      <button
        type="button"
        disabled={item.quantity >= 20}
        aria-label={`Add one ${item.name}`}
        onClick={() => quantity(item.key, 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
