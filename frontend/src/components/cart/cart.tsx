"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ShoppingBag,
  MapPin,
  ShieldCheck,
  Tag,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useStore } from "@/store/use-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { money, restaurants } from "@/lib/data";
import { totals } from "@/lib/commerce";
import { Button } from "@/components/ui/button";
import { Quantity } from "./quantity";
export function Cart({ checkout = false }: { checkout?: boolean }) {
  const {
    items,
    quantity,
    place,
    coupon,
    setCoupon,
    instructions,
    setInstructions,
  } = useStore();
  const hydrated = useHydrated();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [payment, setPayment] = useState("cod");
  const [submitted, setSubmitted] = useState(false);
  const bill = totals(items, coupon);
  const restaurant = restaurants.find((r) => r.id === items[0]?.restaurantId);
  if (!hydrated) return <div className="container page-space skeleton h-96" />;
  if (!items.length)
    return (
      <main className="container empty-state">
        <ShoppingBag size={48} />
        <h1>Your next great meal starts here.</h1>
        <p>Your cart is empty. Let’s find something delicious.</p>
        <Button asChild>
          <Link href="/restaurants">
            Explore restaurants <ArrowRight size={17} />
          </Link>
        </Button>
      </main>
    );
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitted || !checkout) return;
    setSubmitted(true);
    place({
      id: `FG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      items: items.map((i) => ({ ...i })),
      total: bill.total,
      address: `${name}, ${phone}, ${address}`,
      createdAt: new Date().toISOString(),
      status: "PLACED",
      payment: "Demo cash on delivery — not paid",
      instructions,
    });
    router.push("/orders?placed=true");
  }
  return (
    <main className="container page-space">
      <div className="breadcrumb">
        <Link href="/restaurants">Restaurants</Link> /{" "}
        <Link href="/cart">Cart</Link>
        {checkout ? " / Checkout" : ""}
      </div>
      <span className="eyebrow red">A FEW BITES AWAY FROM HAPPINESS</span>
      <h1 className="page-title">
        {checkout ? "The final little details." : "Your bag of good things."}
      </h1>
      <p className="muted mb-7">
        {checkout
          ? "No real payment or delivery takes place in this demo."
          : "One restaurant per order keeps every bite on the same journey."}
      </p>
      <form onSubmit={submit} className="checkout-layout">
        <div className="space-y-6">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="muted text-sm">Ordering from</span>
                <h2>{items[0]?.restaurantName || restaurant?.name || "Restaurant"}</h2>
              </div>
              <Link
                className="red text-sm"
                href={`/restaurant/${items[0]?.restaurantId}`}
              >
                Add more items
              </Link>
            </div>
            {items.map((i) => (
              <article className="cart-item" key={i.key}>
                <div className="cart-thumb">
                  <Image src={i.image} alt={i.name} fill sizes="80px" />
                </div>
                <div className="cart-item-text">
                  <h3>{i.name}</h3>
                  <p>
                    {i.option}
                    {i.extra ? ` (+${money(i.extra)})` : ""}
                  </p>
                  <button
                    type="button"
                    className="remove-link"
                    onClick={() => quantity(i.key, -i.quantity)}
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
                <div className="cart-item-actions">
                  <Quantity item={i} />
                  <strong>{money((i.price + i.extra) * i.quantity)}</strong>
                </div>
              </article>
            ))}
            <label className="field mt-5">
              Cooking or delivery instructions
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={300}
                placeholder="Anything the kitchen should know?"
              />
            </label>
          </section>
          {checkout && (
            <>
              <section className="panel">
                <h2 className="flex items-center gap-2">
                  <MapPin size={21} />
                  Where to deliver?
                </h2>
                <p className="muted text-sm mb-5">
                  Use fictional details for this local demo.
                </p>
                <div className="form-grid">
                  <label className="field">
                    Your name
                    <input
                      required
                      maxLength={80}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Sharma"
                    />
                  </label>
                  <label className="field">
                    Phone number
                    <input
                      required
                      type="tel"
                      pattern="[6-9][0-9]{9}"
                      title="Enter a 10-digit Indian mobile number"
                      maxLength={10}
                      autoComplete="tel-national"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                    />
                  </label>
                </div>
                <label className="field mt-4">
                  Full delivery address
                  <textarea
                    required
                    minLength={10}
                    maxLength={300}
                    autoComplete="street-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Flat / house, street, area and PIN code"
                  />
                </label>
              </section>
              <section className="panel">
                <h2>How would you like to pay?</h2>
                <label className="radio-row">
                  <input
                    type="radio"
                    name="payment"
                    checked={payment === "cod"}
                    onChange={() => setPayment("cod")}
                  />
                  Cash on delivery <span className="demo-pill">DEMO</span>
                </label>
                <div className="radio-row muted">
                  <input
                    type="radio"
                    disabled
                    aria-label="Online payment unavailable"
                  />
                  UPI / Card{" "}
                  <small className="ml-auto">Available in Phase 5</small>
                </div>
                <div className="notice mt-3">
                  This creates a local demo order only. No money is collected
                  and no restaurant is contacted.
                </div>
              </section>
            </>
          )}
        </div>
        <aside>
          <div className="panel bill-panel">
            <h2>A little order summary</h2>
            <div className="coupon-box">
              <Tag size={18} />
              <input
                aria-label="Coupon code"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
              />
              <button
                type="button"
                onClick={() => {
                  if (draft.trim() === "FIRSTBITE" && bill.subtotal >= 199) {
                    setCoupon("FIRSTBITE");
                    setFeedback("FIRSTBITE applied — enjoy your savings.");
                  } else {
                    setCoupon("");
                    setFeedback(
                      draft.trim() === "FIRSTBITE"
                        ? "Minimum order ₹199 required."
                        : "Try FIRSTBITE for 50% off up to ₹100.",
                    );
                  }
                }}
              >
                Apply
              </button>
            </div>
            <p role="status" className="text-xs muted mb-4">
              {feedback || "Try FIRSTBITE · 50% off up to ₹100 on ₹199+"}
            </p>
            <dl className="bill">
              <div>
                <dt>Item total</dt>
                <dd>{money(bill.subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery fee</dt>
                <dd>
                  {bill.delivery ? (
                    money(bill.delivery)
                  ) : (
                    <span className="green">FREE</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Taxes (demo 5%)</dt>
                <dd>{money(bill.tax)}</dd>
              </div>
              {bill.discount > 0 && (
                <div className="green">
                  <dt>Coupon savings</dt>
                  <dd>-{money(bill.discount)}</dd>
                </div>
              )}
              <div className="bill-total">
                <dt>To pay</dt>
                <dd>{money(bill.total)}</dd>
              </div>
            </dl>
            {bill.delivery > 0 && (
              <p className="text-xs muted mb-5">
                Free delivery on orders of ₹500 or more.
              </p>
            )}
            {checkout ? (
              <Button type="submit" disabled={submitted} className="w-full">
                {submitted ? "Creating demo order…" : "Place demo order"}{" "}
                <ArrowRight size={17} />
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link href="/checkout">
                  Continue to checkout <ArrowRight size={17} />
                </Link>
              </Button>
            )}
            <div className="safe-note">
              <ShieldCheck size={16} />
              Demo totals only. Backend validation follows in Phase 4.
            </div>
          </div>
          <div className="notice mt-4">
            <CheckCircle2 size={19} />
            <p>
              Freshly made for you.
              <br />A little care in every order.
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}
