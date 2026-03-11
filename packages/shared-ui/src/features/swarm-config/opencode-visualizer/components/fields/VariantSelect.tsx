"use client";

import { UseFormRegister } from "react-hook-form";

interface VariantSelectProps {
    label?: string;
    register: UseFormRegister<any>;
    path: string;
}

const variants = [
    { value: "max", label: "Max" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "xhigh", label: "XHigh" },
];

export function VariantSelect({ label = "Variant", register, path }: VariantSelectProps) {
    return (
        <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {label}
            </label>
            <select
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                {...register(path)}
            >
                {variants.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                ))}
            </select>
        </div>
    );
}
