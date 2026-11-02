"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useStore } from "@/store/use-store";
import {
  aiService,
  selectedCity,
  type RecommendationRequest,
} from "@/services/ai";
import { RecommendationCard } from "./recommendation-card";
const tabs = [
  ["recommended", "For you"],
  ["budget", "Budget friendly"],
  ["trending", "Trending food"],
  ["discover", "Discover something new"],
  ["frequent", "Frequently ordered"],
] as const;
export function FoodRecommendations({
  restaurantId,
}: {
  restaurantId?: string;
}) {
  const [section, setSection] = useState<RecommendationRequest["section"]>(
      restaurantId ? "similar" : "recommended",
    ),
    [personalize, setPersonalize] = useState(false),
    [dietary, setDietary] = useState<RecommendationRequest["dietary"]>("any");
  const { data: user } = useAuth(),
    location = useStore((state) => state.location),
    city = selectedCity(location);
  const consent = Boolean(user && personalize);
  const query = useQuery({
    queryKey: [
      "food-recommendations",
      city,
      section,
      dietary,
      consent,
      consent ? user?.id : "guest",
      restaurantId,
    ],
    queryFn: ({ signal }) =>
      aiService.recommendations(
        {
          city,
          section,
          dietary,
          personalize: consent,
          restaurantId,
          limit: 6,
        },
        signal,
      ),
    staleTime: 120000,
    retry: false,
  });
  return (
    <section className="section ai-discovery" aria-label="Food recommendations">
      <div className="section-heading">
        <div>
          <span className="eyebrow red">
            <Sparkles size={13} /> A LITTLE INSPIRATION
          </span>
          <h2>
            {restaurantId
              ? "More places for your next craving."
              : "Your next favourite starts here."}
          </h2>
          <p className="muted mt-2">
            Available dishes in {city}, matched to the choices you make.
          </p>
        </div>
      </div>
      <div className="ai-discovery-controls">
        <div
          className="ai-tabs"
          role="group"
          aria-label="Recommendation category"
        >
          {restaurantId ? (
            <button className="chip selected" aria-pressed>
              Similar restaurants
            </button>
          ) : (
            tabs.map(([key, label]) => (
              <button
                key={key}
                className={`chip ${section === key ? "selected" : ""}`}
                aria-pressed={section === key}
                onClick={() => setSection(key)}
              >
                {label}
              </button>
            ))
          )}
        </div>
        <select
          aria-label="Recommendation dietary preference"
          value={dietary}
          onChange={(e) =>
            setDietary(e.target.value as RecommendationRequest["dietary"])
          }
        >
          <option value="any">All food</option>
          <option value="vegetarian">Vegetarian</option>
          <option value="non-vegetarian">Non-vegetarian</option>
        </select>
      </div>
      <label className="ai-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={!user}
          onChange={(e) => setPersonalize(e.target.checked)}
        />
        {user
          ? "Use my favorites and past orders to personalize these results"
          : "Sign in to choose personalization from favorites and past orders"}
      </label>
      {query.isPending ? (
        <div className="ai-recommendation-grid">
          {[1, 2, 3].map((n) => (
            <div className="skeleton h-64 rounded-2xl" key={n} />
          ))}
        </div>
      ) : query.isError ? (
        <div className="notice" role="alert">
          {query.error.message}
          <button className="chip ml-3" onClick={() => void query.refetch()}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : (
        query.data && (
          <>
            <p className="ai-catalog-note" role="status">
              {query.data.message}
            </p>
            {query.data.frequentlyOrderedCuisines.length > 0 && consent && (
              <p className="muted text-sm mb-4">
                Your frequently ordered cuisines:{" "}
                {query.data.frequentlyOrderedCuisines.join(", ")}
              </p>
            )}
            <div className="ai-recommendation-grid">
              {query.data.cards.map((food) => (
                <RecommendationCard food={food} key={food.id} />
              ))}
            </div>
            <p className="ai-disclaimer">{query.data.disclaimer}</p>
          </>
        )
      )}
    </section>
  );
}
