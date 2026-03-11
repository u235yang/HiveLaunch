"use client";

import { UseFormWatch, UseFormSetValue } from "react-hook-form";

interface KeyValueTagsFieldProps {
    label?: string;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
    path: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

export function KeyValueTagsField({
    label = "Key-Value",
    watch,
    setValue,
    path,
    keyPlaceholder = "Key",
    valuePlaceholder = "Value",
}: KeyValueTagsFieldProps) {
    const rawValue = watch(path);
    const entries = rawValue && typeof rawValue === "object" ? Object.entries(rawValue) : [];

    const handleRemove = (keyToRemove: string) => {
        const newObj = { ...rawValue };
        delete newObj[keyToRemove];
        setValue(path, newObj, { shouldDirty: true });
    };

    const handleAdd = () => {
        const key = prompt(`请输入 ${label} 的 Key:`);
        if (!key || !key.trim()) return;
        
        const valueStr = prompt(`请输入 ${label} 的 Value:`);
        if (valueStr === null) return;
        
        const value = Number(valueStr) || 0;
        const newObj = { ...rawValue, [key.trim()]: value };
        setValue(path, newObj, { shouldDirty: true });
    };

    return (
        <div className="flex items-start gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0 pt-1">
                {label}
            </label>
            <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                    {entries.map(([key, value]: [string, any]) => (
                        <span
                            key={key}
                            className="px-2 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-orange-700 dark:text-primary flex items-center gap-1"
                        >
                            <span>{key}: {value}</span>
                            <button type="button" onClick={() => handleRemove(key)} className="hover:text-red-500 ml-1">
                                ×
                            </button>
                        </span>
                    ))}
                    {entries.length === 0 && <span className="text-xs text-slate-400">暂无</span>}
                </div>
                <button type="button" onClick={handleAdd} className="text-xs text-primary hover:underline">
                    + 添加
                </button>
            </div>
        </div>
    );
}
