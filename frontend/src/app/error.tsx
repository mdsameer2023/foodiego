"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container empty-state">
      <h1>A little hiccup in the kitchen.</h1>
      <p>Please try loading this page again.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
