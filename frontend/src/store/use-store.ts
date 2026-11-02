import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, DemoOrder, MenuItem } from "@/types";
type State = {
  items: CartItem[];
  favorites: string[];
  location: string;
  orders: DemoOrder[];
  coupon: string;
  instructions: string;
  setCoupon: (coupon: string) => void;
  setInstructions: (instructions: string) => void;
  add: (item: MenuItem, option?: string, extra?: number, selections?:Array<{group:string;options:string[]}>) => boolean;
  quantity: (key: string, delta: number) => void;
  clear: () => void;
  favorite: (id: string) => void;
  setLocation: (location: string) => void;
  place: (order: DemoOrder) => void;
  cancel: (id: string) => void;
};
export const useStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      favorites: [],
      location: "Park Street, Kolkata",
      orders: [],
      coupon: "",
      instructions: "",
      setCoupon: (coupon) => set({ coupon }),
      setInstructions: (instructions) => set({ instructions }),
      add: (item, option = "Regular", extra = 0, selections = []) => {
        if (get().items.some((i) => i.restaurantId !== item.restaurantId))
          return false;
        const key = `${item.id}-${JSON.stringify(selections.length?selections:option)}`;
        set((s) => ({
          items: s.items.some((i) => i.key === key)
            ? s.items.map((i) =>
                i.key === key
                  ? { ...i, quantity: Math.min(20, i.quantity + 1) }
                  : i,
              )
            : [...s.items, { ...item, option, extra, key, quantity: 1, selections }],
        }));
        return true;
      },
      quantity: (key, delta) =>
        set((s) => ({
          items: s.items
            .map((i) =>
              i.key === key
                ? { ...i, quantity: Math.min(20, i.quantity + delta) }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      clear: () => set({ items: [], coupon: "", instructions: "" }),
      favorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((x) => x !== id)
            : [...s.favorites, id],
        })),
      setLocation: (location) => set({ location }),
      place: (order) =>
        set((s) => ({
          orders: [order, ...s.orders],
          items: [],
          coupon: "",
          instructions: "",
        })),
      cancel: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, status: "CANCELLED" } : o,
          ),
        })),
    }),
    { name: "foodiego-demo-v1",partialize:state=>({...state,orders:[],instructions:''}),merge:(stored,current)=>({...current,...stored as Partial<State>,orders:[],instructions:''}) },
  ),
);
