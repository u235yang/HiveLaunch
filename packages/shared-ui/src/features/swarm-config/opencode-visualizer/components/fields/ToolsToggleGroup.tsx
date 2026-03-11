"use client";

import { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { Switch } from "../../../../../components/ui/switch";

interface ToolsToggleGroupProps {
    label?: string;
    watch: UseFormWatch<any>;
    setValue: UseFormSetValue<any>;
    basePath: string;
}

export function ToolsToggleGroup({ label = "Tools", watch, setValue, basePath }: ToolsToggleGroupProps) {
    const tools = watch(`${basePath}.tools`) || {};
    const toolEntries = Object.entries(tools);

    const handleToggle = (toolName: string, currentValue: boolean) => {
        setValue(`${basePath}.tools.${toolName}`, !currentValue, { shouldDirty: true });
    };

    if (toolEntries.length === 0) {
        return null;
    }

    return (
        <div className="flex items-start gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {label}
            </label>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-2">
                {toolEntries.map(([toolName, enabled]) => (
                    <label key={toolName} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <Switch 
                            checked={enabled as boolean} 
                            onCheckedChange={() => handleToggle(toolName, enabled as boolean)} 
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{toolName}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}
