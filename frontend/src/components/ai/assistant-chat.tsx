"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, RotateCcw, Sparkles, LoaderCircle } from "lucide-react";
import {
  aiService,
  selectedCity,
  type RecommendationResponse,
} from "@/services/ai";
import { useStore } from "@/store/use-store";
import { useAuth } from "@/hooks/use-auth";
import { RecommendationCard } from "./recommendation-card";
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  result?: RecommendationResponse;
};
const questions = [
  "Suggest vegetarian food under ₹200",
  "Find something spicy",
  "Find biryani in my city",
  "Show food with fast delivery",
];
export default function AssistantChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lastQuestion, setLastQuestion] = useState(""),
    [personalize, setPersonalize] = useState(false),
    [retention, setRetention] = useState(15);
  const location = useStore((state) => state.location),
    { data: user } = useAuth(),
    bottom = useRef<HTMLDivElement>(null),
    request = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  useEffect(() => {
    const timer = setTimeout(() => {
      generation.current++;
      request.current?.abort();
      setMessages([]);
      setBusy(false);
      setError("");
    }, retention * 60000);
    return () => clearTimeout(timer);
  }, [messages, retention]);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    const id = ++generation.current;
    request.current?.abort();
    request.current = new AbortController();
    setBusy(true);
    setError("");
    setLastQuestion(question);
    setInput("");
    setMessages((current) => [
      ...current.slice(-10),
      { id: id * 2, role: "user", text: question },
    ]);
    try {
      const result = await aiService.chat(
        {
          message: question,
          city: selectedCity(location),
          personalize: Boolean(personalize && user),
          limit: 4,
        },
        request.current.signal,
      );
      if (generation.current !== id) return;
      setRetention(result.retentionMinutes);
      setMessages((current) => [
        ...current,
        { id: id * 2 + 1, role: "assistant", text: result.message, result },
      ]);
    } catch (cause) {
      if (generation.current === id)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not get recommendations. Please try again.",
        );
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }
  const reset = () => {
    generation.current++;
    request.current?.abort();
    setMessages([]);
    setInput("");
    setError("");
    setBusy(false);
    setLastQuestion("");
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ai-chat-overlay" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("food-assistant-message")?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("foodiego-assistant-launcher")?.focus();
          }}
          className="ai-chat-drawer"
          aria-describedby="ai-chat-description"
        >
          <header className="ai-chat-header">
            <span className="ai-bot">
              <Bot size={25} />
            </span>
            <div>
              <Dialog.Title>FoodieGo food assistant</Dialog.Title>
              <Dialog.Description id="ai-chat-description">
                A little help finding your next favourite.
              </Dialog.Description>
            </div>
            <button
              type="button"
              className="ai-icon-button"
              aria-label="Reset conversation"
              onClick={reset}
            >
              <RotateCcw size={18} />
            </button>
            <Dialog.Close
              className="ai-icon-button"
              aria-label="Close assistant"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <div
            className="ai-chat-body"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.length === 0 && (
              <div className="ai-chat-welcome">
                <span className="ai-welcome-mark">
                  <Bot size={46} />
                </span>
                <span className="eyebrow red">
                  GOOD FOOD STARTS WITH A QUESTION
                </span>
                <h2>What sounds good today?</h2>
                <p>
                  Tell me your cuisine, budget or dietary preference. I&apos;ll
                  match it to the current catalog in {selectedCity(location)}.
                </p>
                <div className="ai-question-grid">
                  {questions.map((question) => (
                    <button
                      type="button"
                      key={question}
                      onClick={() => void send(question)}
                    >
                      <Sparkles size={14} />
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div
                className={`ai-message ai-message-${message.role}`}
                key={message.id}
              >
                <p>{message.text}</p>
                {message.result && (
                  <>
                    {message.result.mode === "fallback" && (
                      <span className="ai-mode">
                        Catalog fallback · Gemini unavailable
                      </span>
                    )}
                    <div className="ai-chat-cards">
                      {message.result.cards.map((food) => (
                        <RecommendationCard food={food} key={food.id} compact />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-thinking" role="status">
                <LoaderCircle size={17} className="animate-spin" /> Finding
                matching dishes…
              </div>
            )}
            {error && (
              <div role="alert" className="ai-chat-error">
                <p>{error}</p>
                <button type="button" onClick={() => void send(lastQuestion)}>
                  Try again
                </button>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <footer className="ai-chat-footer">
            <label className="ai-consent">
              <input
                type="checkbox"
                disabled={!user || busy}
                checked={Boolean(user && personalize)}
                onChange={(e) => setPersonalize(e.target.checked)}
              />
              {user
                ? "Use my favorites and past orders"
                : "Sign in to opt into personalization"}
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label className="sr-only" htmlFor="food-assistant-message">
                Ask the food assistant
              </label>
              <textarea
                id="food-assistant-message"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={2000}
                placeholder="What are you craving?"
                rows={2}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={busy || input.trim().length < 2}
              >
                <Send size={19} />
              </button>
            </form>
            <small>
              Chat stays in this window and clears after {retention} minutes of
              inactivity. Don&apos;t share passwords or payment details.
              Recommendations do not place orders.
            </small>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
