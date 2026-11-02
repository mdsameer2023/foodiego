"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
const Recommendations = dynamic(
  () =>
    import("./recommendations").then((module) => module.FoodRecommendations),
  { ssr: false },
);
export function RecommendationsEntry({
  restaurantId,
}: {
  restaurantId?: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container}>
      {visible ? (
        <Recommendations restaurantId={restaurantId} />
      ) : (
        <section
          className="section ai-discovery"
          aria-label="Food recommendations"
        >
          <div className="skeleton h-64 rounded-2xl" />
        </section>
      )}
    </div>
  );
}
