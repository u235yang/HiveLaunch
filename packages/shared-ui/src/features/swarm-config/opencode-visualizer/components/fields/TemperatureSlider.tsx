"use client";

import { UseFormWatch } from "react-hook-form";

interface TemperatureSliderProps {
    label?: string;
    watch: UseFormWatch<any>;
    path: string;
    register: any;
}

export function TemperatureSlider({ label = "Temperature", watch, path, register }: TemperatureSliderProps) {
    const value = watch(path) ?? 0.7;

    return (
        <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {label}
            </label>
            <input
                className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                max="2"
                min="0"
                step="0.1"
                type="range"
                {...register(path, { valueAsNumber: true })}
                style={{ accentColor: "#f59f0b" }}
            />
            <span className="w-12 text-sm font-mono text-slate-600 dark:text-slate-300 text-right">
                {value.toFixed(1)}
            </span>
        </div>
    );
}
