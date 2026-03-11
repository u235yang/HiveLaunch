"use client";

import { UseFormRegister } from "react-hook-form";

interface PromptTextareaProps {
    label?: string;
    register: UseFormRegister<any>;
    path: string;
    rows?: number;
}

export function PromptTextarea({ label = "Prompt", register, path, rows = 4 }: PromptTextareaProps) {
    return (
        <div className="flex gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0 pt-2">
                {label}
            </label>
            <textarea
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                rows={rows}
                {...register(path)}
            />
        </div>
    );
}
