"use client";

import { UseFormRegister } from "react-hook-form";

interface SelectOption {
    value: string;
    label: string;
}

interface SelectFieldProps {
    label?: string;
    register: UseFormRegister<any>;
    path: string;
    options: SelectOption[];
    placeholder?: string;
}

export function SelectField({ label = "Select", register, path, options, placeholder }: SelectFieldProps) {
    return (
        <div className="flex items-center gap-3">
            {label && (
                <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    {label}
                </label>
            )}
            <select
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                {...register(path)}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}
