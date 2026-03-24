// ============================================
// MANUAL PAIR SUGGESTION STORE
// ============================================
// Cross-page state for "Consiglia Trade" feature.
// Allows user to select two accounts on Board
// and force-pair them during next generation on Trades.

import { create } from 'zustand';

// PhaseName defined locally (was imported from useOperatorTrading in old project)
export type PhaseName = 'fase1' | 'fase2' | 'live';

export interface ManualPairSelection {
  accountAId: string;
  accountBId: string;
}

interface ManualPairState {
  /** Whether selection mode is active */
  isSelecting: boolean;
  /** Which phase is being targeted */
  selectingPhase: PhaseName | null;
  /** First selected account ID (partial selection) */
  firstSelectedId: string | null;
  /** Completed forced pairs ready for generation */
  forcedPairs: ManualPairSelection[];

  // Actions
  startSelecting: (phase: PhaseName) => void;
  cancelSelecting: () => void;
  selectAccount: (accountId: string) => void;
  removePair: (index: number) => void;
  clearAllPairs: () => void;
  /** Called after generation to reset everything */
  resetAfterGeneration: () => void;
}

export const useManualPairStore = create<ManualPairState>((set, get) => ({
  isSelecting: false,
  selectingPhase: null,
  firstSelectedId: null,
  forcedPairs: [],

  startSelecting: (phase) => set({
    isSelecting: true,
    selectingPhase: phase,
    firstSelectedId: null,
  }),

  cancelSelecting: () => set({
    isSelecting: false,
    selectingPhase: null,
    firstSelectedId: null,
  }),

  selectAccount: (accountId) => {
    const { firstSelectedId, forcedPairs } = get();

    if (!firstSelectedId) {
      // First click: store first account
      set({ firstSelectedId: accountId });
    } else {
      if (firstSelectedId === accountId) {
        // Clicked same account: deselect
        set({ firstSelectedId: null });
        return;
      }

      // Second click: complete the pair
      const newPair: ManualPairSelection = {
        accountAId: firstSelectedId,
        accountBId: accountId,
      };

      set({
        forcedPairs: [...forcedPairs, newPair],
        firstSelectedId: null,
        isSelecting: false,
        selectingPhase: null,
      });
    }
  },

  removePair: (index) => {
    const { forcedPairs } = get();
    set({ forcedPairs: forcedPairs.filter((_, i) => i !== index) });
  },

  clearAllPairs: () => set({ forcedPairs: [], firstSelectedId: null }),

  resetAfterGeneration: () => set({
    isSelecting: false,
    selectingPhase: null,
    firstSelectedId: null,
    forcedPairs: [],
  }),
}));
