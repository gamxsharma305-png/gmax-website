import { useEffect, useState } from "react";
import {
  Check,
  Crown,
  Loader2,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import {
  PREMIUM_FEATURES,
  PREMIUM_PLANS,
  type PlanId,
} from "@/lib/gmax/premium";
import { usePremium } from "@/store/premium";
import { useUi } from "@/store/ui";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function SubscriptionModal() {
  const closeOverlay = useUi((s) => s.closeOverlay);
  const premium = usePremium();
  const [selected, setSelected] = useState<PlanId>("m3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!premium.hydrated) premium.hydrate();
  }, [premium]);

  const plan = PREMIUM_PLANS.find((p) => p.id === selected)!;

  const startPay = async () => {
    setError(null);
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Could not load Razorpay. Check network.");

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selected }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        planId?: PlanId;
      };

      if (!res.ok || !data.success || !data.orderId || !data.keyId) {
        throw new Error(data.error || "Could not create order. Add Razorpay keys on Vercel.");
      }

      const rzp = new window.Razorpay!({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "GMAX Premium",
        description: `${plan.label} · ad-free music`,
        order_id: data.orderId,
        theme: { color: "#1db954" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const v = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...response,
                planId: selected,
              }),
            });
            const vr = (await v.json()) as { success?: boolean; error?: string };
            if (!v.ok || !vr.success) {
              setError(vr.error || "Payment verification failed");
              setBusy(false);
              return;
            }
            premium.grant(selected, response.razorpay_payment_id);
            setSuccess(true);
          } catch {
            setError("Verification failed. Contact support with payment ID.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });

      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  };

  if (success || premium.active) {
    return (
      <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-raised shadow-2xl">
          <div className="relative bg-gradient-to-br from-accent/30 via-raised to-bg px-6 pb-8 pt-10 text-center">
            <button
              type="button"
              onClick={closeOverlay}
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-lift/80"
            >
              <X size={18} />
            </button>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-accent text-bg shadow-lg">
              <Crown size={32} />
            </div>
            <h2 className="text-2xl font-bold">You're Premium</h2>
            <p className="mt-2 text-sm text-muted">
              Enjoy HQ music, playlists & ad-free listening.
              {premium.expiresAt
                ? ` Valid till ${new Date(premium.expiresAt).toLocaleDateString()}`
                : ""}
            </p>
            <button
              type="button"
              onClick={closeOverlay}
              className="mt-6 h-12 w-full rounded-full bg-accent text-sm font-semibold text-bg"
            >
              Continue listening
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-bg shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-b from-accent/20 to-transparent px-5 pb-2 pt-5">
          <button
            type="button"
            onClick={closeOverlay}
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-lift"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-bg">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold">GMAX Premium</h2>
              <p className="text-[12px] text-muted">Unlock the full experience</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* Stacked feature cards — inspired by card UI video */}
          <div className="relative mx-auto mt-4 h-[140px] w-full max-w-[280px]">
            {[
              "from-violet-500/80 to-purple-700/60",
              "from-emerald-400/80 to-teal-600/60",
              "from-amber-400/70 to-orange-600/50",
            ].map((grad, i) => (
              <div
                key={grad}
                className={`absolute left-1/2 w-[88%] overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br ${grad} shadow-xl`}
                style={{
                  height: 120,
                  transform: `translateX(-50%) translateY(${i * 10}px) scale(${1 - i * 0.05})`,
                  zIndex: 3 - i,
                  opacity: 1 - i * 0.12,
                }}
              >
                <div className="flex h-full flex-col justify-end p-4">
                  <p className="text-sm font-semibold text-white drop-shadow">
                    {i === 0 ? "Ad-free music 🎵" : i === 1 ? "HQ streaming" : "Smart playlists"}
                  </p>
                  <p className="text-[11px] text-white/80">GMAX Premium</p>
                </div>
              </div>
            ))}
          </div>

          {/* Features */}
          <ul className="mt-8 space-y-2.5">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3 rounded-xl bg-raised px-3 py-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 text-accent">
                  <Check size={14} strokeWidth={3} />
                </span>
                <span>
                  <span className="block text-[14px] font-medium">{f.title}</span>
                  <span className="block text-[11px] text-muted">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Plan cards */}
          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
            Choose a plan
          </p>
          <div className="grid gap-2">
            {PREMIUM_PLANS.map((p) => {
              const active = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={`relative flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                    active
                      ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                      : "border-line bg-raised"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold">{p.label}</span>
                      {p.badge ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-bg">
                          {p.badge}
                        </span>
                      ) : null}
                    </div>
                    {p.savePct ? (
                      <p className="mt-0.5 text-[11px] text-accent">Save {p.savePct}%</p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted">Flexible · cancel anytime</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">₹{p.priceInr}</p>
                    <p className="text-[10px] text-muted">
                      ~₹{Math.round(p.priceInr / p.months)}/mo
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-[12px] text-red-400">
              {error}
            </p>
          ) : null}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <Shield size={12} /> Secure payments via Razorpay · UPI, cards, netbanking
          </p>
        </div>

        {/* CTA */}
        <div className="shrink-0 border-t border-hairline bg-raised px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startPay()}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-bg disabled:opacity-60"
            style={{ height: 52 }}
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Opening Razorpay…
              </>
            ) : (
              <>Pay ₹{plan.priceInr} · {plan.label}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
