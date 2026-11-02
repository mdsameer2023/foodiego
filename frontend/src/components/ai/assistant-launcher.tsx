"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
const loadAssistant = () => import("./assistant-chat");
const AssistantChat = dynamic(loadAssistant, { ssr: false });
export function AssistantLauncher() {
  const path = usePathname(),
    [open, setOpen] = useState(false);
  const { data: user } = useAuth();
  if (
    [
      "/admin",
      "/restaurant-dashboard",
      "/delivery-dashboard",
      "/login",
      "/signup",
      "/checkout",
      "/cart",
    ].some((root) => path === root || path.startsWith(root + "/"))
  )
    return null;
  return (
    <>
      <button
        id="foodiego-assistant-launcher"
        type="button"
        className="ai-launcher"
        aria-label="Open FoodieGo food assistant"
        aria-haspopup="dialog"
        onPointerEnter={() => void loadAssistant()}
        onFocus={() => void loadAssistant()}
        onClick={() => setOpen(true)}
      >
        <Bot size={24} />
        <span>Ask FoodieGo</span>
      </button>
      {open && (
        <AssistantChat
          key={user?.id || "guest"}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
