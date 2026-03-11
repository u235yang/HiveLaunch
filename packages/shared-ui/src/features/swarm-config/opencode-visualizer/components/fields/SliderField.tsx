"use client";

import { UseFormWatch } from "react-hook-form";

interface SliderFieldProps {
    label?: string;
    watch: UseFormWatch<any>;
    path: string;
    register: any;
    min?: number;
    max?: number;
    step?: number;
    formatValue?: (value: number) => string;
}

export function SliderField({ 
    label, 
    watch, 
    path, 
    register, 
    min = 0, 
    max = 100, 
    step = 1,
    formatValue = (v) => String(v) 
}: SliderFieldProps) {
    const value = watch(path) ?? min;

    return (
        <div className="flex items-center gap-3">
            {label && (
                <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {label}
                </label>
            )}
            <input
                className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                max={max}
                min={min}
                step={step}
                type="range"
                {...register(path, { valueAsNumber: true })}
                style={{ accentColor: "#f59f0b" }}
            />
            <span className="w-16 text-sm font-mono text-slate-600 dark:text-slate-300 text-right">
                {formatValue(value)}
            </span>
        </div>
    );
}
