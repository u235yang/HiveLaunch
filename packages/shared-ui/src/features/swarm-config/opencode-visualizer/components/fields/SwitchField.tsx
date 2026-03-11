"use client";

import { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Switch } from "../../../../../components/ui/switch";

interface SwitchFieldProps {
    label?: string;
    description?: string;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
    path: string;
}

export function SwitchField({ label, description, watch, setValue, path }: SwitchFieldProps) {
    const value = watch(path) ?? false;

    const handleToggle = () => {
        setValue(path, !value, { shouldDirty: true });
    };

    return (
        <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
            <div>
                {label && (
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {label}
                    </span>
                )}
                {description && (
                    <p className="text-xs text-slate-500">{description}</p>
                )}
            </div>
            <Switch checked={value} onCheckedChange={handleToggle} />
        </label>
    );
}
