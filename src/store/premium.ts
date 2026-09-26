import { create } from "zustand";
import {
  activatePremium,
  loadPremium,
  type PlanId,
  type PremiumState,
} from "@/lib/gmax/premium";

type PremiumStore = PremiumState & {
  hydrated: boolean;
  hydrate: () => void;
  grant: (planId: PlanId, paymentId: string) => void;
  clear: () => void;
};

export const usePremium = create<PremiumStore>((set) => ({
  active: false,
  planId: null,
  expiresAt: null,
  paymentId: null,
  hydrated: false,
  hydrate: () => {
    const s = loadPremium();
    set({ ...s, hydrated: true });
  },
  grant: (planId, paymentId) => {
    const s = activatePremium(planId, paymentId);
    set({ ...s, hydrated: true });
  },
  clear: () => {
    const s = { active: false, planId: null, expiresAt: null, paymentId: null };
    try {
      localStorage.removeItem("gmax.premium");
    } catch {
      /* */
    }
    set({ ...s, hydrated: true });
  },
}));
