"use client";
import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldCheck, Database, Sparkles } from "lucide-react";
import { api } from "@/services/api";
type Metrics = {
  uptimeSeconds: number;
  requests: number;
  serverErrors: number;
  paymentErrors: number;
  webhookErrors: number;
  orderErrors: number;
  slowRequests: number;
  scope: string;
};
type AiStatus = {
  configured: boolean;
  model: string | null;
  providerVerified: boolean;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    failures: number;
    fallbacks: number;
  } | null;
  conversationStorage: string;
};
export default function AdminMonitoring() {
  const metrics = useQuery({
    queryKey: ["monitoring", "backend"],
    queryFn: () => api<Metrics>("/admin/monitoring"),
    refetchInterval: 15000,
    retry: 1,
  });
  const ai = useQuery({
    queryKey: ["monitoring", "ai"],
    queryFn: () => api<AiStatus>("/ai/status"),
    refetchInterval: 30000,
    retry: 1,
  });
  const ready = useQuery({
    queryKey: ["monitoring", "readiness"],
    queryFn: () => api<{ status: string; database: string }>("/health/ready"),
    refetchInterval: 15000,
    retry: 1,
  });
  if (metrics.isPending || ai.isPending)
    return (
      <div className="dash-stats">
        {[1, 2, 3, 4].map((key) => (
          <div className="skeleton h-32 rounded-2xl" key={key} />
        ))}
      </div>
    );
  if (metrics.isError || ai.isError)
    return (
      <div className="notice" role="alert">
        Monitoring is temporarily unavailable.{" "}
        <button
          className="chip"
          onClick={() => {
            void metrics.refetch();
            void ai.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  const data = metrics.data,
    status = ai.data;
  if (!data || !status) return null;
  const cards = [
    ["Requests", data.requests],
    ["Server errors", data.serverErrors],
    ["Payment errors", data.paymentErrors],
    ["Webhook errors", data.webhookErrors],
    ["Order errors", data.orderErrors],
    ["Requests over 2 seconds", data.slowRequests],
    ["Uptime (minutes)", Math.floor(data.uptimeSeconds / 60)],
    ["AI fallbacks today", status.usage?.fallbacks || 0],
  ] as const;
  return (
    <>
      <div className="dash-stats">
        {cards.map(([name, value]) => (
          <article className="dash-stat" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
            <small>
              Observed backend metrics
              <Activity size={16} />
            </small>
          </article>
        ))}
      </div>
      <section className="dash-panel">
        <h3>Service status</h3>
        <div className="dash-rank">
          <Database size={18} />
          <strong>Database readiness</strong>
          <b>
            {ready.isPending
              ? "Checking…"
              : ready.isError
                ? "Unavailable"
                : ready.data.status}
          </b>
        </div>
        <div className="dash-rank">
          <Sparkles size={18} />
          <strong>Food assistant</strong>
          <b>
            {status.configured
              ? "Gemini configured; verify access"
              : "Catalog fallback"}
          </b>
        </div>
        <div className="dash-rank">
          <ShieldCheck size={18} />
          <strong>Conversation storage</strong>
          <b>{status.conversationStorage}</b>
        </div>
        <p className="muted text-sm mt-4">{data.scope}</p>
      </section>
      <section className="dash-panel">
        <h3>AI usage and limits</h3>
        <dl className="dash-details">
          <div>
            <dt>Provider requests today</dt>
            <dd>
              {status.usage?.requests || 0} / {status.dailyRequestLimit}
            </dd>
          </div>
          <div>
            <dt>Observed tokens today</dt>
            <dd>
              {(status.usage?.inputTokens || 0) +
                (status.usage?.outputTokens || 0)}{" "}
              / {status.dailyTokenLimit}
            </dd>
          </div>
          <div>
            <dt>Provider failures today</dt>
            <dd>{status.usage?.failures || 0}</dd>
          </div>
          <div>
            <dt>Configured model</dt>
            <dd>{status.model || "Not configured"}</dd>
          </div>
        </dl>
        <p className="muted text-sm">
          Observed usage is not a billing invoice. Timed-out provider operations
          may still incur charges. External uptime and spend alerts require
          hosting/provider configuration.
        </p>
      </section>
    </>
  );
}
