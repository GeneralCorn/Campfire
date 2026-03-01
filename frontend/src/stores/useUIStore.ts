import { create } from "zustand";

export type ActiveStage = "orb" | "pt_camera" | "chart";

interface UIState {
    activeStage: ActiveStage;
    setActiveStage: (stage: ActiveStage) => void;

    chartData: string | null;
    setChartData: (html: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    activeStage: "orb",
    setActiveStage: (stage) => set({ activeStage: stage }),

    chartData: null,
    setChartData: (html) => set({ chartData: html }),
}));
