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
import { getDeviceId } from "@/lib/gmax/device";
import {
  PREMIUM_FEATURES,
  PREMIUM_PLANS,
  type PlanId,
} from "@/lib/gmax/premium";
import { usePremium } from "@/store/premium";
import { useUi } from "@/store/ui";

type ShowcaseCard = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  gradient: string;
  Icon: typeof Headphones;
};

const SHOWCASE: ShowcaseCard[] = [
  {
    id: "hq",
    title: "HQ Audio",
    subtitle: "Crystal clear streams",
    status: "Premium",
    gradient: "linear-gradient(160deg, #34d399 0%, #059669 45%, #0f172a 100%)",
    Icon: Headphones,
  },
  {
    id: "playlists",
    title: "Unlimited lists",
    subtitle: "Create without limits",
    status: "Unlocked",
    gradient: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 45%, #0f172a 100%)",
    Icon: ListMusic,
  },
  {
    id: "bg",
    title: "Background play",
    subtitle: "Music while you multitask",
    status: "Active",
    gradient: "linear-gradient(160deg, #fbbf24 0%, #ea580c 45%, #0f172a 100%)",
    Icon: Radio,
  },
  {
    id: "ads",
    title: "Ad-free 🎵",
    subtitle: "Zero interruptions",
    status: "Clean",
    gradient: "linear-gradient(160deg, #38bdf8 0%, #2563eb 45%, #0f172a 100%)",
    Icon: Zap,
  },
];

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

  const order = [0, 1, 2].map((offset) => (active + offset) % n);

  return (
    <div className="relative mx-auto mt-5 h-[200px] w-full max-w-[300px] select-none">
      {order.map((cardIndex, stackPos) => {
        const card = SHOWCASE[cardIndex]!;
        const Icon = card.Icon;
        const isFront = stackPos === 0;
        let transform = "";
        let opacity = 1;
        let z = 30 - stackPos;
        if (isFront && animating) {
          transform = "translateX(-72%) translateY(8px) scale(0.92) rotate(-6deg)";
          opacity = 0;
          z = 40;
        } else if (stackPos === 1 && animating) {
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
            <div className="relative flex h-full flex-col p-4">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-2xl bg-white/15 text-white">
                  <Icon size={22} />
                </span>
                <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/90">
                  {card.status}
                </span>
              </div>
              <div className="mt-auto">
                <p className="text-[17px] font-bold text-white">{card.title}</p>
                <p className="mt-0.5 text-[12px] text-white/80">{card.subtitle}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SubscriptionModal() {
  const closeOverlay = useUi((s) => s.closeOverlay);
  const premium = usePremium();
  const [selected, setSelected] = useState<PlanId>("m3");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!premium.hydrated) premium.hydrate();
  }, [premium]);

  // After return from rzp.io — poll unlock
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gmax_pay_pending");
      if (!raw) return;
      const p = JSON.parse(raw) as { ts?: number };
      if (!p.ts || Date.now() - p.ts > 45 * 60 * 1000) {
        localStorage.removeItem("gmax_pay_pending");
        return;
      }
      setPolling(true);
      void premium.pollUnlock(90000).then((ok) => {
        setPolling(false);
        if (ok) setSuccess(true);
        else
          setError(
            "Payment not confirmed yet. Wait 30s and open Premium again, or ensure you tapped Pay Now on this site first.",
          );
      });
    } catch {
      /* */
    }
  }, []);

  const plan = PREMIUM_PLANS.find((p) => p.id === selected)!;

  const startPay = async () => {
    setError(null);
    setBusy(true);
    try {
      const deviceId = getDeviceId();
      const amount = plan.priceInr;

      const res = await fetch("/api/register-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          profileId: "gmax",
          plan: plan.label,
          amount,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        paymentPageUrl?: string | null;
        error?: string;
        hint?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not register payment");
      }

      try {
        localStorage.setItem(
          "gmax_pay_pending",
          JSON.stringify({
            amount,
            plan: plan.label,
            profileId: "gmax",
            deviceId,
            ts: Date.now(),
          }),
        );
      } catch {
        /* */
      }

      if (!data.paymentPageUrl) {
        throw new Error(
          data.hint ||
            "Payment page URL missing. Set RAZORPAY_PAYMENT_PAGE_29 / _49 / _59 on Vercel.",
        );
      }

      // Redirect to Razorpay Payment Page (no API keys)
      window.location.href = data.paymentPageUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusy(false);
    }
  };

  if (success || premium.active) {
    return (
      <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-raised shadow-2xl">
          <div className="relative px-6 pb-8 pt-10 text-center">
            <button
              type="button"
              onClick={closeOverlay}
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-lift/80"
            >
              <X size={18} />
            </button>
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-accent text-bg">
              <Crown size={32} />
            </div>
            <h2 className="text-2xl font-bold">You're Premium</h2>
            <p className="mt-2 text-sm text-muted">
              {premium.expiresAt
                ? `Valid till ${new Date(premium.expiresAt).toLocaleDateString()}`
                : "Membership active on this device"}
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
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-bg">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold">GMAX Premium</h2>
              <p className="text-[12px] text-muted">₹29 · ₹49 · ₹59 · Payment Page</p>
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
                  className={`relative flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left ${
                    active
                      ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                      : "border-line bg-raised"
                  }`}
                >
                  <div>
                    <span className="text-[15px] font-semibold">{p.label}</span>
                    {p.badge ? (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-bg">
                        {p.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-lg font-bold">₹{p.priceInr}</p>
                </button>
              );
            })}
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-amber-500/15 px-3 py-2 text-[12px] text-amber-100">
              {error}
            </p>
          ) : null}
          {polling ? (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Checking payment…
            </p>
          ) : null}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <Shield size={12} /> Pay on this device · unlock stays here
          </p>
        </div>

        <div className="shrink-0 border-t border-hairline bg-raised px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy || polling}
            onClick={() => void startPay()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-bg disabled:opacity-60"
            style={{ height: 52 }}
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Opening payment…
              </>
            ) : (
              <>Pay Now · ₹{plan.priceInr}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
