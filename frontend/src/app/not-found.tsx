import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container empty-state">
      <h1>This bite is off the menu.</h1>
      <p>We couldn’t find that page.</p>
      <Link className="button button-primary" href="/restaurants">
        Explore restaurants
      </Link>
    </main>
  );
}
