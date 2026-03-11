"use client";

import { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Switch } from "../../../../../components/ui/switch";

interface ThinkingConfigProps {
    label?: string;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
    basePath: string;
}

export function ThinkingConfig({ label = "Thinking", watch, setValue, basePath }: ThinkingConfigProps) {
    const thinking = watch(`${basePath}.thinking`) || {};
    const enabled = thinking.type === "enabled";
    const budget = thinking.budgetTokens || 200000;

    const handleToggle = () => {
        setValue(`${basePath}.thinking`, {
            type: enabled ? "disabled" : "enabled",
            budgetTokens: enabled ? undefined : 200000,
        }, { shouldDirty: true });
    };

    const handleBudgetChange = (value: number) => {
        setValue(`${basePath}.thinking.budgetTokens`, value, { shouldDirty: true });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {label}
                </label>
                <div className="flex items-center gap-2">
                    <Switch checked={enabled} onCheckedChange={handleToggle} />
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                        {enabled ? "Enabled" : "Disabled"}
                    </span>
                </div>
            </div>
            {enabled && (
                <div className="flex items-center gap-3 pl-28">
                    <label className="w-20 text-xs text-slate-500">Budget:</label>
                    <input
                        className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        max="500000"
                        min="50000"
                        step="10000"
                        type="range"
                        value={budget}
                        onChange={(e) => handleBudgetChange(Number(e.target.value))}
                        style={{ accentColor: "#f59f0b" }}
                    />
                    <span className="w-20 text-xs font-mono text-slate-600 dark:text-slate-300 text-right">
                        {budget.toLocaleString()}
                    </span>
                </div>
            )}
        </div>
    );
}
