"use client";
import Link from "next/link";
import { useState } from "react";
import {
  PackageCheck,
  ShoppingBag,
  ArrowRight,
  MapPin,
  Heart,
  ReceiptText,
} from "lucide-react";
import { useStore } from "@/store/use-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { restaurants, money } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { DemoOrder } from "@/types";
export function Orders() {
  const { orders, cancel, items, clear, add } = useStore();
  const hydrated = useHydrated();
  const [selected, setSelected] = useState<DemoOrder | null>(null);
  const [message, setMessage] = useState("");
  const [reorder, setReorder] = useState<DemoOrder | null>(null);
  function repeat(order: DemoOrder) {
    clear();
    order.items.forEach((i) => {
      for (let n = 0; n < i.quantity; n++) add(i, i.option, i.extra);
    });
    setReorder(null);
    setMessage(
      "Your previous meal is back in your cart. Review it before checkout.",
    );
  }
  return (
    <main className="container page-space">
      <span className="eyebrow red">YOUR FOOD STORIES</span>
      <h1 className="page-title">A history of happy cravings.</h1>
      <p className="muted mb-6">
        Local demo orders only. No live tracking or restaurant status updates.
      </p>
      <p className="green mb-3" aria-live="polite">
        {message}{" "}
        {message && (
          <Link href="/cart" className="underline">
            View cart
          </Link>
        )}
      </p>
      {hydrated && orders.length ? (
        <div className="space-y-4">
          {orders.map((o) => (
            <article className="panel order-card" key={o.id}>
              <div className="order-icon">
                <PackageCheck size={28} />
              </div>
              <div className="grow">
                <span className="eyebrow muted">
                  {o.id} · {new Date(o.createdAt).toLocaleDateString("en-IN")}
                </span>
                <h2>
                  {
                    o.items[0]?.restaurantName || restaurants.find((r) => r.id === o.items[0].restaurantId)?.name || "Restaurant"
                  }
                </h2>
                <p className="muted">
                  {o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
                </p>
                <strong>{money(o.total)}</strong>{" "}
                <span className="demo-pill ml-3">
                  {o.status === "PLACED" ? "DEMO ORDER PLACED" : "CANCELLED"}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setSelected(o)}>
                  Details
                </Button>
                <Button
                  onClick={() => (items.length ? setReorder(o) : repeat(o))}
                >
                  Reorder
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ShoppingBag size={40} />
          <h2>Your first food story is waiting.</h2>
          <p>Place a demo order to see it here.</p>
          <Button asChild>
            <Link href="/restaurants">
              Find your favourite <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      )}
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={selected?.id || "Order details"}
      >
        {selected && (
          <>
            <div className="notice mb-4">
              {selected.status === "PLACED"
                ? "Demo order recorded locally. No delivery is in progress."
                : "This demo order has been cancelled."}
            </div>
            <p className="mb-3">
              <MapPin size={16} className="inline mr-2" />
              {selected.address}
            </p>
            <p className="muted text-sm mb-3">{selected.payment}</p>
            {selected.instructions && (
              <p className="mb-3">Instructions: {selected.instructions}</p>
            )}
            <ol className="timeline">
              {[
                "Placed",
                "Confirmed",
                "Preparing",
                "Ready for pickup",
                "Picked up",
                "On the way",
                "Delivered",
              ].map((s, i) => (
                <li key={s} className={i === 0 ? "current" : ""}>
                  {s}
                  <small>
                    {i === 0 ? "Recorded locally" : "Requires backend workflow"}
                  </small>
                </li>
              ))}
            </ol>
            {selected.status === "PLACED" && (
              <Button
                variant="outline"
                onClick={() => {
                  cancel(selected.id);
                  setSelected({ ...selected, status: "CANCELLED" });
                }}
              >
                Cancel demo order
              </Button>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={!!reorder}
        onOpenChange={(v) => {
          if (!v) setReorder(null);
        }}
        title="Replace your current cart?"
      >
        <p className="muted mb-5">
          Reordering will replace the items already in your cart.
        </p>
        <Button onClick={() => reorder && repeat(reorder)}>
          Replace cart & reorder
        </Button>
      </Modal>
    </main>
  );
}
export function Profile() {
  return (
    <main className="container page-space">
      <span className="eyebrow red">YOUR LITTLE CORNER</span>
      <h1 className="page-title">Hello, food lover.</h1>
      <p className="muted mb-7">
        Account and address management will be connected in Phase 2.
      </p>
      <div className="profile-grid">
        {[
          {
            href: "/login",
            icon: MapPin,
            title: "Your profile",
            text: "Preview the login experience.",
          },
          {
            href: "/favorites",
            icon: Heart,
            title: "Your favourites",
            text: "All the kitchens you’ve saved.",
          },
          {
            href: "/orders",
            icon: ReceiptText,
            title: "Your orders",
            text: "Revisit your local demo orders.",
          },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link className="panel" href={href} key={href}>
            <Icon className="red mb-4" />
            <h2>{title}</h2>
            <p className="muted">{text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
export function ComingSoon({ admin = false }: { admin?: boolean }) {
  return (
    <main className="container empty-state">
      <PackageCheck size={42} />
      <span className="eyebrow red">PLANNED FOR PHASE 6</span>
      <h1>{admin ? "Admin workspace" : "Restaurant & delivery workspace"}</h1>
      <p>
        Management tools will be added with backend authentication and
        role-based access.
        <br />
        This Phase 1 placeholder does not grant privileged access.
      </p>
      <Button asChild>
        <Link href="/">Back to FoodieGo</Link>
      </Button>
    </main>
  );
}
