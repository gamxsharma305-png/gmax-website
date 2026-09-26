import { useEffect, useState } from "react";
import {
  Check,
  Crown,
  Headphones,
  ListMusic,
  Loader2,
  Radio,
  Shield,
  Sparkles,
  X,
  Zap,
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

type ShowcaseCard = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusOn: boolean;
  gradient: string;
  Icon: typeof Headphones;
};

const SHOWCASE: ShowcaseCard[] = [
  {
    id: "hq",
    title: "HQ Audio",
    subtitle: "Crystal clear streams",
    status: "Premium",
    statusOn: true,
    gradient: "linear-gradient(160deg, #34d399 0%, #059669 45%, #0f172a 100%)",
    Icon: Headphones,
  },
  {
    id: "playlists",
    title: "Unlimited lists",
    subtitle: "Create without limits",
    status: "Unlocked",
    statusOn: true,
    gradient: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 45%, #0f172a 100%)",
    Icon: ListMusic,
  },
  {
    id: "bg",
    title: "Background play",
    subtitle: "Music while you multitask",
    status: "Active",
    statusOn: true,
    gradient: "linear-gradient(160deg, #fbbf24 0%, #ea580c 45%, #0f172a 100%)",
    Icon: Radio,
  },
  {
    id: "ads",
    title: "Ad-free 🎵",
    subtitle: "Zero interruptions",
    status: "Clean",
    statusOn: true,
    gradient: "linear-gradient(160deg, #38bdf8 0%, #2563eb 45%, #0f172a 100%)",
    Icon: Zap,
  },
];

/** Video-style stacked card deck with auto-cycle */
function AnimatedCardStack() {
  const n = SHOWCASE.length;
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      setAnimating(true);
      window.setTimeout(() => {
        setActive((i) => (i + 1) % n);
        setAnimating(false);
      }, 380);
    }, 2600);
    return () => clearInterval(t);
  }, [n]);

  // Order: active on top, then next, then rest
  const order = [0, 1, 2].map((offset) => (active + offset) % n);

  return (
    <div className="relative mx-auto mt-5 h-[200px] w-full max-w-[300px] select-none">
      {order.map((cardIndex, stackPos) => {
        const card = SHOWCASE[cardIndex]!;
        const Icon = card.Icon;
        // stackPos 0 = front
        const isFront = stackPos === 0;

        // Exit animation for outgoing front card
        let transform = "";
        let opacity = 1;
        let z = 30 - stackPos;

        if (isFront && animating) {
          // slide left + fade like the video
          transform = "translateX(-72%) translateY(8px) scale(0.92) rotate(-6deg)";
          opacity = 0;
          z = 40;
        } else if (stackPos === 1 && animating) {
          // second card rises to front
          transform = "translateX(-50%) translateY(0) scale(1)";
          z = 35;
        } else {
          const y = stackPos * 14;
          const scale = 1 - stackPos * 0.06;
          const x = -50 + stackPos * 3;
          transform = `translateX(${x}%) translateY(${y}px) scale(${scale})`;
          opacity = 1 - stackPos * 0.08;
        }

        return (
          <div
            key={`${card.id}-${stackPos}-${active}`}
            className="absolute left-1/2 top-0 w-[78%] overflow-hidden rounded-[20px] border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
            style={{
              height: 168,
              transform,
              opacity,
              zIndex: z,
              transition:
                "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease",
              background: card.gradient,
            }}
          >
            {/* Soft grid / shine */}
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), transparent 55%)",
              }}
            />

            <div className="relative flex h-full flex-col p-4">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
                  <Icon size={22} />
                </span>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                  <span
                    className="mr-1 inline-block size-1.5 rounded-full"
                    style={{ background: card.statusOn ? "#4ade80" : "#94a3b8" }}
                  />
                  {card.status}
                </span>
              </div>

              <div className="mt-auto">
                <p className="text-[17px] font-bold leading-tight text-white drop-shadow">
                  {card.title}
                </p>
                <p className="mt-0.5 text-[12px] text-white/80">{card.subtitle}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-white/60">
                    GMAX Premium
                  </span>
                  <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-900">
                    Included
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Dots */}
      <div className="absolute -bottom-1 left-1/2 z-50 flex -translate-x-1/2 gap-1.5">
        {SHOWCASE.map((c, i) => (
          <button
            key={c.id}
            type="button"
            aria-label={`Show ${c.title}`}
            onClick={() => {
              if (i === active || animating) return;
              setAnimating(true);
              window.setTimeout(() => {
                setActive(i);
                setAnimating(false);
              }, 280);
            }}
            className="size-1.5 rounded-full transition-all"
            style={{
              background: i === active ? "var(--color-accent, #1db954)" : "rgba(255,255,255,0.25)",
              width: i === active ? 14 : 6,
            }}
          />
        ))}
      </div>
    </div>
  );
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
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-bg shadow-2xl sm:rounded-3xl">
        <div className="relative shrink-0 px-5 pb-1 pt-5">
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
              <p className="text-[12px] text-muted">Cards cycle · pick a plan below</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <AnimatedCardStack />

          <ul className="mt-10 space-y-2.5">
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

        <div className="shrink-0 border-t border-hairline bg-raised px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startPay()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-bg disabled:opacity-60"
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
