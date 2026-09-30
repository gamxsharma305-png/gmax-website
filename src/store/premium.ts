import { create } from "zustand";
import { getDeviceId } from "@/lib/gmax/device";
import {
  activatePremium,
  loadPremium,
  savePremium,
  type PlanId,
  type PremiumState,
} from "@/lib/gmax/premium";

type PremiumStore = PremiumState & {
  hydrated: boolean;
  hydrate: () => void;
  grant: (planId: PlanId, paymentId: string) => void;
  grantUntil: (until: number, planLabel?: string) => void;
  clear: () => void;
  /** Poll Redis after Payment Page return */
  pollUnlock: (maxMs?: number) => Promise<boolean>;
};

function planIdFromLabel(plan?: string): PlanId {
  const p = String(plan || "").toLowerCase();
  if (p.includes("3") || p.includes("90")) return "m3";
  if (p.includes("2") || p.includes("60")) return "m2";
  return "m1";
}

export const usePremium = create<PremiumStore>((set, get) => ({
  active: false,
  planId: null,
  expiresAt: null,
  paymentId: null,
  hydrated: false,

  hydrate: () => {
    // 1) localStorage first
    const local = loadPremium();
    if (local.active && local.expiresAt && local.expiresAt > Date.now()) {
      set({ ...local, hydrated: true });
      return;
    }

    // 2) one Redis check via payment-status
    const deviceId = getDeviceId();
    void fetch(
      `/api/payment-status?deviceId=${encodeURIComponent(deviceId)}&profileId=gmax`,
    )
      .then((r) => r.json())
      .then((j: { status?: string; until?: number; plan?: string }) => {
        if (j.status === "approved" && j.until && j.until > Date.now()) {
          const state: PremiumState = {
            active: true,
            planId: planIdFromLabel(j.plan),
            expiresAt: j.until,
            paymentId: null,
          };
          savePremium(state);
          set({ ...state, hydrated: true });
        } else {
          set({ ...local, active: false, hydrated: true });
        }
      })
      .catch(() => {
        set({ ...local, hydrated: true });
      });
  },

  grant: (planId, paymentId) => {
    const s = activatePremium(planId, paymentId);
    set({ ...s, hydrated: true });
  },

  grantUntil: (until, planLabel) => {
    const state: PremiumState = {
      active: until > Date.now(),
      planId: planIdFromLabel(planLabel),
      expiresAt: until,
      paymentId: null,
    };
    savePremium(state);
    set({ ...state, hydrated: true });
  },

  clear: () => {
    const s = { active: false, planId: null, expiresAt: null, paymentId: null };
    try {
      localStorage.removeItem("gmax.premium");
      localStorage.removeItem("gmax_pay_pending");
    } catch {
      /* */
    }
    set({ ...s, hydrated: true });
  },

  pollUnlock: async (maxMs = 90000) => {
    const deviceId = getDeviceId();
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      try {
        const r = await fetch(
          `/api/payment-status?deviceId=${encodeURIComponent(deviceId)}&profileId=gmax`,
        );
        const j = (await r.json()) as {
          status?: string;
          until?: number;
          plan?: string;
        };
        if (j.status === "approved" && j.until && j.until > Date.now()) {
          get().grantUntil(j.until, j.plan);
          try {
            localStorage.removeItem("gmax_pay_pending");
          } catch {
            /* */
          }
          return true;
        }
      } catch {
        /* */
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
    return false;
  },
}));
