import { create } from 'zustand';
import { PropFirmRules, initialPropFirms } from '../data/propFirmsData';

interface PropFirmStore {
  propFirms: PropFirmRules[];
  addPropFirm: (firm: PropFirmRules) => void;
  updatePropFirm: (index: number, firm: PropFirmRules) => void;
  deletePropFirm: (index: number) => void;
  setPropFirms: (firms: PropFirmRules[]) => void;
}

export const usePropFirmStore = create<PropFirmStore>((set) => ({
  propFirms: initialPropFirms,
  addPropFirm: (firm) => set((state) => ({ propFirms: [...state.propFirms, firm] })),
  updatePropFirm: (index, firm) => set((state) => ({
    propFirms: state.propFirms.map((f, i) => i === index ? firm : f)
  })),
  deletePropFirm: (index) => set((state) => ({
    propFirms: state.propFirms.filter((_, i) => i !== index)
  })),
  setPropFirms: (firms) => set({ propFirms: firms }),
}));
