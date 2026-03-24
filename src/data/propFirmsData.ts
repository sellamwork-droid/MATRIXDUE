export interface PropFirmRules {
  name: string;
  color: "orange" | "red" | "blue" | "green" | "purple" | "cyan";
  profitTarget: {
    fase1: string;
    fase2: string;
  };
  rischioMax: {
    fase1: string;
    fase2: string;
  };
  profitMax: {
    fase1: string;
    fase2: string;
  };
  maxLossFunded: string;
  giorniMinimi: string;
  newsPolicyChallenge: string;
  newsPolicyFunded: string;
  periodoInattivita: string;
}

export const initialPropFirms: PropFirmRules[] = [
  {
    name: "FUNDER PRO",
    color: "blue",
    profitTarget: { fase1: "10%", fase2: "8%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "4.5%", fase2: "3.5%" },
    maxLossFunded: "4%",
    giorniMinimi: "Nessuno",
    newsPolicyChallenge: "PERMESSO",
    newsPolicyFunded: "Non permesso 2 min prima e dopo",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "FUNDING PIPS",
    color: "purple",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "3%",
    giorniMinimi: "3 GG minimi di trading",
    newsPolicyChallenge: "PERMESSO",
    newsPolicyFunded: "Non permesso 5 min prima e dopo",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "5%ERS",
    color: "orange",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "4%",
    giorniMinimi: "3 GG profittevoli al 0.5%",
    newsPolicyChallenge: "Non permesso 2 min prima e dopo",
    newsPolicyFunded: "Non permesso 2 min prima e dopo",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "FUNDED NEXT",
    color: "green",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "4%",
    giorniMinimi: "5 GG minimi di trading",
    newsPolicyChallenge: "PERMESSO, tranne nelle express",
    newsPolicyFunded: "VIETATO 5 min prima e dopo",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "ALPHA CAPITAL",
    color: "red",
    profitTarget: { fase1: "10%", fase2: "5%" },
    rischioMax: { fase1: "2% - 4% in caso di esplosione", fase2: "2% - 4% in caso di esplosione" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "2% - 4% in caso di esplosione",
    giorniMinimi: "3 GG minimi di trading",
    newsPolicyChallenge: "PERMESSO",
    newsPolicyFunded: "Non permesso 2 min prima e dopo",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "FINTOKEI",
    color: "cyan",
    profitTarget: { fase1: "8%", fase2: "6%" },
    rischioMax: { fase1: "2%", fase2: "2%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "2%",
    giorniMinimi: "3 GG minimi di trading",
    newsPolicyChallenge: "PERMESSO",
    newsPolicyFunded: "PERMESSO",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "ACQUA FUNDED",
    color: "cyan",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "4%",
    giorniMinimi: "Da definire",
    newsPolicyChallenge: "Da definire",
    newsPolicyFunded: "Da definire",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "GOAT FUNDED",
    color: "green",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "4%",
    giorniMinimi: "Da definire",
    newsPolicyChallenge: "Da definire",
    newsPolicyFunded: "Da definire",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "TTP",
    color: "purple",
    profitTarget: { fase1: "8%", fase2: "5%" },
    rischioMax: { fase1: "4%", fase2: "4%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "4%",
    giorniMinimi: "Da definire",
    newsPolicyChallenge: "Da definire",
    newsPolicyFunded: "Da definire",
    periodoInattivita: "30 giorni di inattività",
  },
  {
    name: "FTMO",
    color: "blue",
    profitTarget: { fase1: "10%", fase2: "5%" },
    rischioMax: { fase1: "5%", fase2: "5%" },
    profitMax: { fase1: "Nessuno", fase2: "Nessuno" },
    maxLossFunded: "5%",
    giorniMinimi: "4 GG minimi di trading",
    newsPolicyChallenge: "PERMESSO",
    newsPolicyFunded: "PERMESSO",
    periodoInattivita: "30 giorni di inattività",
  },
];

export const colorMap = {
  orange: {
    dot: "bg-amber-500",
    border: "border-amber-500/30 hover:border-amber-500/60",
  },
  red: {
    dot: "bg-red-500",
    border: "border-red-500/30 hover:border-red-500/60",
  },
  blue: {
    dot: "bg-blue-500",
    border: "border-blue-500/30 hover:border-blue-500/60",
  },
  green: {
    dot: "bg-green-500",
    border: "border-green-500/30 hover:border-green-500/60",
  },
  purple: {
    dot: "bg-purple-500",
    border: "border-purple-500/30 hover:border-purple-500/60",
  },
  cyan: {
    dot: "bg-cyan-500",
    border: "border-cyan-500/30 hover:border-cyan-500/60",
  },
};

export const colorOptions = [
  { value: "orange", label: "Arancione", class: "bg-amber-500" },
  { value: "red", label: "Rosso", class: "bg-red-500" },
  { value: "blue", label: "Blu", class: "bg-blue-500" },
  { value: "green", label: "Verde", class: "bg-green-500" },
  { value: "purple", label: "Viola", class: "bg-purple-500" },
  { value: "cyan", label: "Ciano", class: "bg-cyan-500" },
];
