"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GuestCartMerge } from "@/components/cart/guest-merge";
import { AssistantLauncher } from '@/components/ai/assistant-launcher';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}<GuestCartMerge/><AssistantLauncher/></QueryClientProvider>;
}
