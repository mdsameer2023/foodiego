"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MapPin,
  ChevronDown,
  Search,
  ShoppingBag,
  ArrowUpRight,
  House,
  Tag,
  ReceiptText,
  UserRound,
  Heart,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "@/store/use-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
export function Header() {
  const path = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const { location, setLocation } = useStore();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [locationError, setLocationError] = useState("");
  const { data: user } = useAuth();
  if (
    ["/admin", "/restaurant-dashboard", "/delivery-dashboard"].some(
      (root) => path === root || path.startsWith(root + "/"),
    )
  )
    return null;
  return (
    <>
      <div className="announcement">
        Good food. Great mood.{" "}
        <span>Your next favourite meal is a tap away.</span>
        <span className="demo-label">DEMO EXPERIENCE</span>
      </div>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="logo">
            foodie<span>go</span>
            <i>.</i>
          </Link>
          <button className="location-button" onClick={() => setOpen(true)}>
            <MapPin size={19} className="red" />
            <span>
              <small>Explore in</small>
              <strong>{hydrated ? location : "Park Street, Kolkata"}</strong>
            </span>
            <ChevronDown size={14} />
          </button>
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/restaurants?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search restaurants or cuisines"
              placeholder="Search for restaurants, dishes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          {user ? (
            <Link href="/profile" className="login-link">
              Hi, {user.name.split(" ")[0]}
            </Link>
          ) : (
            <>
              <Link href="/login" className="login-link">
                Log in
              </Link>
              <Button asChild className="signup-link">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
          <Link
            href="/cart"
            className="cart-link"
            aria-label={`Cart with ${hydrated ? count : 0} items`}
          >
            <ShoppingBag size={22} />
            <b>{hydrated ? count : 0}</b>
          </Link>
        </div>
      </header>
      <nav className="main-nav container">
        {[
          ["/", "Home"],
          ["/restaurants", "Delivery"],
          ["/restaurants?view=dining", "Dining"],
          ["/restaurants?offers=true", "Offers"],
          ["/favorites", "Favorites"],
          ["/orders", "My orders"],
        ].map(([href, label]) => (
          <Link
            key={label}
            href={href}
            className={path === href ? "active" : ""}
          >
            {label}
            {label === "Offers" && <span className="new-tag">NEW</span>}
          </Link>
        ))}
        {user?.role === "DELIVERY_PARTNER" && (
          <Link
            href="/deliveries"
            className={path === "/deliveries" ? "active" : ""}
          >
            My deliveries
          </Link>
        )}
      </nav>
      <nav className="mobile-nav">
        {[
          ["/", "Home", House],
          ["/restaurants", "Search", Search],
          ["/restaurants?offers=true", "Offers", Tag],
          ["/orders", "Orders", ReceiptText],
          ["/profile", "Profile", UserRound],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof House;
          return (
            <Link
              href={href as string}
              key={label as string}
              className={path === href ? "red" : ""}
            >
              <I size={20} />
              {label as string}
            </Link>
          );
        })}
      </nav>
      <Modal open={open} onOpenChange={setOpen} title="Choose your city">
        <p className="muted mb-4">
          Browse restaurants by city. Delivery availability is not verified.
        </p>
        <form
          className="discovery-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCity.trim()) {
              setLocation(manualCity.trim());
              setOpen(false);
              router.push(
                `/restaurants?city=${encodeURIComponent(manualCity.trim())}`,
              );
            }
          }}
        >
          <Search size={18} />
          <input
            aria-label="Enter city"
            value={manualCity}
            onChange={(e) => setManualCity(e.target.value)}
            placeholder="Enter city"
          />
          <button aria-label="Save city">
            <ArrowUpRight size={18} />
          </button>
        </form>
        <Button
          variant="outline"
          className="mb-4"
          onClick={() => {
            if (!navigator.geolocation) {
              setLocationError(
                "Location is unavailable. Enter your city instead.",
              );
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setLocationError("");
                setOpen(false);
                router.push(
                  `/restaurants?lat=${position.coords.latitude}&lng=${position.coords.longitude}&radiusKm=10`,
                );
              },
              () =>
                setLocationError(
                  "Location permission was denied. Enter your city instead.",
                ),
              { enableHighAccuracy: false, timeout: 10000 },
            );
          }}
        >
          Use my current location
        </Button>
        {locationError && (
          <p role="alert" className="red mb-3">
            {locationError}
          </p>
        )}
        <div className="space-y-2">
          {[
            "Park Street, Kolkata",
            "Salt Lake, Kolkata",
            "Ballygunge, Kolkata",
            "New Town, Kolkata",
          ].map((l) => (
            <button
              key={l}
              className="location-option"
              onClick={() => {
                setLocation(l);
                setOpen(false);
                router.push(`/restaurants?city=Kolkata`);
              }}
            >
              <MapPin size={18} />
              {l}
              {l === location && <span className="red ml-auto">Selected</span>}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
export function Footer() {
  const path = usePathname();
  if (
    ["/admin", "/restaurant-dashboard", "/delivery-dashboard"].some(
      (root) => path === root || path.startsWith(root + "/"),
    )
  )
    return null;
  return (
    <footer>
      <div className="container footer-grid">
        <div>
          <Link href="/" className="logo">
            foodie<span>go</span>
            <i>.</i>
          </Link>
          <p>
            Made for your cravings.
            <br />
            Delivered with a little happiness.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link href="/restaurants">
            Restaurants <ArrowUpRight size={13} />
          </Link>
          <Link href="/restaurants?offers=true">Today&apos;s offers</Link>
          <Link href="/favorites">
            Your favourites <Heart size={13} />
          </Link>
        </div>
        <div>
          <h4>Your FoodieGo</h4>
          <Link href="/orders">My orders</Link>
          <Link href="/profile">Profile</Link>
          <Link href="/deliveries">Partner deliveries</Link>
        </div>
        <div>
          <h4>A little heads-up</h4>
          <p>
            Sample restaurants and demo coupons.
            <br />
            Cash on Delivery and test payments are saved to your account.
            <br />
            No real restaurant delivery is offered.
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        © {new Date().getFullYear()} FoodieGo. Made with good taste.
        <span>Kolkata, India · English</span>
      </div>
    </footer>
  );
}
