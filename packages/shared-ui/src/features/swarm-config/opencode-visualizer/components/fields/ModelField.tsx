"use client";

import { useState } from "react";
import { UseFormRegister, FieldErrors } from "react-hook-form";
import { ChevronDown, Check, Loader2, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../../components/ui/popover";
import { cn } from "../../../../../lib/utils";

interface ModelProvider {
    id: string;
    name: string;
}

interface ModelInfo {
    id: string;
    name: string;
    provider_id?: string;
}

interface ModelSelectorConfig {
    providers: ModelProvider[];
    models: ModelInfo[];
}

interface ModelFieldProps {
    label?: string;
    register: UseFormRegister<any>;
    path: string;
    errors?: FieldErrors;
    placeholder?: string;
    selectedModelId?: string;
    onModelSelect?: (modelId: string) => void;
    modelSelectorConfig?: ModelSelectorConfig;
    isLoadingModels?: boolean;
    onRefreshModels?: () => void;
    isRefreshingModels?: boolean;
}

export function ModelField({
    label = "Model",
    register,
    path,
    placeholder = "provider/model-id",
    selectedModelId,
    onModelSelect,
    modelSelectorConfig,
    isLoadingModels = false,
    onRefreshModels,
    isRefreshingModels = false,
}: ModelFieldProps) {
    const [isOpen, setIsOpen] = useState(false);

    const providers = modelSelectorConfig?.providers ?? [];
    const models = modelSelectorConfig?.models ?? [];
    const hasDynamicSelector = !!modelSelectorConfig && !!onModelSelect;

    const modelsByProvider = new Map<string, ModelInfo[]>();
    const ungroupedModels: ModelInfo[] = [];

    for (const model of models) {
        if (model.provider_id) {
            const list = modelsByProvider.get(model.provider_id) ?? [];
            list.push(model);
            modelsByProvider.set(model.provider_id, list);
        } else {
            ungroupedModels.push(model);
        }
    }

    const getProviderName = (providerId: string) => {
        const provider = providers.find((p) => p.id === providerId);
        return provider?.name ?? providerId;
    };

    const getFullModelId = (model: ModelInfo): string => {
        if (model.provider_id) {
            return `${model.provider_id}/${model.id}`;
        }
        return model.id;
    };

    const selectedModel = models.find((m) => {
        const fullId = getFullModelId(m);
        return fullId === selectedModelId || m.id === selectedModelId;
    });
    const displayName = selectedModel?.name ?? selectedModelId ?? "选择模型";

    return (
        <div className="flex items-center gap-3">
            <label className="w-28 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {label}
            </label>
            {hasDynamicSelector ? (
                <div className="flex-1">
                    <input type="hidden" {...register(path)} />
                    <Popover open={isOpen} onOpenChange={setIsOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                disabled={isLoadingModels}
                                className={cn(
                                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm",
                                    "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg",
                                    "hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
                                    "disabled:opacity-60 disabled:cursor-not-allowed"
                                )}
                            >
                                <span className="min-w-0 truncate font-mono">{displayName}</span>
                                <div className="flex items-center gap-1">
                                    {onRefreshModels && (
                                        <RefreshCw
                                            className={cn("h-3.5 w-3.5 text-slate-400", isRefreshingModels && "animate-spin")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRefreshModels();
                                            }}
                                        />
                                    )}
                                    {isLoadingModels ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                    ) : (
                                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                    )}
                                </div>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" sideOffset={4} className="w-[90vw] max-w-[320px] p-1.5 max-h-[300px] overflow-y-auto">
                            {models.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-slate-500">
                                    {isLoadingModels ? "加载模型中..." : "暂无可用模型"}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {Array.from(modelsByProvider.entries()).map(([providerId, providerModels]) => (
                                        <div key={providerId}>
                                            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                {getProviderName(providerId)}
                                            </div>
                                            {providerModels.map((model) => (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onModelSelect(getFullModelId(model));
                                                        setIsOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-md transition-colors",
                                                        model.id === selectedModelId || getFullModelId(model) === selectedModelId
                                                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                                                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    <span className="truncate">{model.name}</span>
                                                    {(model.id === selectedModelId || getFullModelId(model) === selectedModelId) && (
                                                        <Check className="h-4 w-4 text-amber-500" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                    {ungroupedModels.length > 0 && (
                                        <div>
                                            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                其他
                                            </div>
                                            {ungroupedModels.map((model) => (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onModelSelect(getFullModelId(model));
                                                        setIsOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-md transition-colors",
                                                        model.id === selectedModelId || getFullModelId(model) === selectedModelId
                                                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                                                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    )}
                                                >
                                                    <span className="truncate">{model.name}</span>
                                                    {(model.id === selectedModelId || getFullModelId(model) === selectedModelId) && (
                                                        <Check className="h-4 w-4 text-amber-500" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            ) : (
                <input
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={placeholder}
                    {...register(path)}
                />
            )}
        </div>
    );
}
