/** GMAX Premium plans & local entitlement helpers */

export type PlanId = "m1" | "m2" | "m3";

export type PremiumPlan = {
  id: PlanId;
  months: number;
  priceInr: number;
  label: string;
  badge?: string;
  savePct?: number;
};

/** Amounts in INR (Razorpay uses paise = * 100) */
export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: "m1",
    months: 1,
    priceInr: 29,
    label: "1 Month",
  },
  {
    id: "m2",
    months: 2,
    priceInr: 49,
    label: "2 Months",
    badge: "Popular",
    savePct: Math.round((1 - 49 / (29 * 2)) * 100),
  },
  {
    id: "m3",
    months: 3,
    priceInr: 59,
    label: "3 Months",
    badge: "Best value",
    savePct: Math.round((1 - 59 / (29 * 3)) * 100),
  },
];

export const PREMIUM_FEATURES = [
  { title: "High quality music", desc: "Up to HQ / 320kbps when available" },
  { title: "Unlimited playlists", desc: "Create as many playlists as you want" },
  { title: "Auto playlist", desc: "Smart queues from your taste" },
  { title: "Background playback", desc: "Keep music going while you multitask" },
  { title: "Ad-free experience", desc: "No interruptions — pure music 🎵" },
  { title: "And more", desc: "Early access to new GMAX features" },
];

export type PremiumState = {
  active: boolean;
  planId: PlanId | null;
  expiresAt: number | null;
  paymentId: string | null;
};

const STORAGE_KEY = "gmax.premium";

export function loadPremium(): PremiumState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: false, planId: null, expiresAt: null, paymentId: null };
    const p = JSON.parse(raw) as PremiumState;
    if (p.expiresAt && p.expiresAt < Date.now()) {
      const cleared = { active: false, planId: null, expiresAt: null, paymentId: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleared));
      return cleared;
    }
    return {
      active: Boolean(p.active && p.expiresAt && p.expiresAt > Date.now()),
      planId: p.planId ?? null,
      expiresAt: p.expiresAt ?? null,
      paymentId: p.paymentId ?? null,
    };
  } catch {
    return { active: false, planId: null, expiresAt: null, paymentId: null };
  }
}

export function savePremium(state: PremiumState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

export function activatePremium(planId: PlanId, paymentId: string): PremiumState {
  const plan = PREMIUM_PLANS.find((p) => p.id === planId);
  const months = plan?.months ?? 1;
  const expiresAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
  const state: PremiumState = {
    active: true,
    planId,
    expiresAt,
    paymentId,
  };
  savePremium(state);
  return state;
}

export function getPlan(planId: PlanId): PremiumPlan | undefined {
  return PREMIUM_PLANS.find((p) => p.id === planId);
}
