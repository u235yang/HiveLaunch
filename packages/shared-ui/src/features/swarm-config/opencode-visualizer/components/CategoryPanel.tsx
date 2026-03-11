"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import type { Path, PathValue } from "react-hook-form";
import type { OpencodeConfig } from "../schema";
import { ConfigAccordion } from "./containers/ConfigAccordion";
import { ConfigSection } from "./containers/ConfigSection";
import {
    ModelField,
    VariantSelect,
    TemperatureSlider,
    TopPSlider,
    ThinkingConfig,
    PromptTextarea,
    ToolsToggleGroup,
    SwitchField,
} from "./fields";

// Category 信息
const categoryInfo: Record<string, { name: string; description: string }> = {
    "visual-engineering": { name: "Visual Engineering", description: "前端 UI/UX 开发专用类别" },
    ultrabrain: { name: "Ultrabrain", description: "复杂逻辑问题专用类别" },
    deep: { name: "Deep", description: "深度研究型任务" },
    artistry: { name: "Artistry", description: "创造性任务" },
    quick: { name: "Quick", description: "快速简单任务" },
    "unspecified-low": { name: "Unspecified-Low", description: "低复杂度需求分析" },
    "unspecified-high": { name: "Unspecified-High", description: "高复杂度需求分析" },
    writing: { name: "Writing", description: "文档写作类别" },
    research: { name: "Research", description: "文档研究与外部信息检索" },
};

interface CategoryPanelProps {
    embedded?: boolean;
    modelSelectorConfig?: {
        providers: Array<{ id: string; name: string }>;
        models: Array<{ id: string; name: string; provider_id?: string }>;
    };
    isLoadingModels?: boolean;
    onRefreshModels?: () => void;
    isRefreshingModels?: boolean;
}

export default function CategoryPanel({
    embedded = false,
    modelSelectorConfig,
    isLoadingModels = false,
    onRefreshModels,
    isRefreshingModels = false,
}: CategoryPanelProps) {
    const { register, watch, setValue } = useFormContext<OpencodeConfig>();
    const categories = watch("categories") || {};
    const categoryList = Object.entries(categories);
    const [isAdding, setIsAdding] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [addError, setAddError] = useState("");

    const handleAddCategory = (name: string) => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            return;
        }
        const key = trimmedName.toLowerCase().replace(/\s+/g, "-");
        if (categories[key]) {
            setAddError("该 Category 已存在");
            return;
        }
        setValue(`categories.${key}`, { description: "新添加的 Category" }, { shouldDirty: true });
        setNewCategoryName("");
        setAddError("");
        setIsAdding(false);
    };

    return (
        <div className={embedded ? "p-4 space-y-4" : "h-full overflow-auto p-6"}>
            {/* 页面标题 */}
            {!embedded && (
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Categories</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Agent 类别配置模板，可被 Agent 继承</p>
                </div>
            )}

            {/* 功能说明 */}
            {!embedded && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Category 配置选项说明</h3>
                    <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                        <li>• model: 使用的模型</li>
                        <li>• variant: 模型变体</li>
                        <li>• temperature: 温度参数</li>
                        <li>• top_p: 核采样参数</li>
                        <li>• thinking: 扩展思考配置</li>
                        <li>• prompt: 系统提示词</li>
                        <li>• tools: 工具开关</li>
                        <li>• disabled: 是否禁用</li>
                    </ul>
                </div>
            )}

            {/* 添加按钮 */}
            <div className="mb-4 space-y-2">
                {isAdding ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <input
                                value={newCategoryName}
                                onChange={(e) => {
                                    setNewCategoryName(e.target.value);
                                    if (addError) setAddError("");
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddCategory(newCategoryName);
                                    }
                                    if (e.key === "Escape") {
                                        setIsAdding(false);
                                        setNewCategoryName("");
                                        setAddError("");
                                    }
                                }}
                                placeholder="输入 Category 名称"
                                className="h-8 w-full max-w-xs rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => handleAddCategory(newCategoryName)}
                                className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded-md hover:bg-amber-600 transition-colors"
                            >
                                添加
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAdding(false);
                                    setNewCategoryName("");
                                    setAddError("");
                                }}
                                className="px-2 py-1.5 text-xs text-slate-500 hover:underline"
                            >
                                取消
                            </button>
                        </div>
                        {addError ? <span className="text-xs text-red-500">{addError}</span> : null}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white text-xs rounded-md hover:bg-amber-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        <span>添加 Category</span>
                    </button>
                )}
            </div>

            {/* Category 手风琴列表 */}
            <div className="space-y-3">
                {categoryList.map(([key, config]) => {
                    const info = categoryInfo[key] || { name: key, description: config.description || "" };
                    const basePath = `categories.${key}`;
                    const modelPath = `${basePath}.model` as Path<OpencodeConfig>;
                    const hasConfig = Object.keys(config).length > 0;

                    return (
                        <ConfigAccordion
                            key={key}
                            title={info.name}
                            subtitle={info.description}
                            defaultOpen={false}
                            badge={
                                <div className="flex items-center gap-2">
                                    {config.disabled && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">已禁用</span>
                                    )}
                                    {config.model && (
                                        <span className="text-xs font-mono text-slate-500">{config.model}</span>
                                    )}
                                </div>
                            }
                        >
                            {/* Description */}
                            <PromptTextarea
                                label="Description"
                                register={register}
                                path={`${basePath}.description`}
                                rows={2}
                            />

                            {/* Model & Variant */}
                            <ModelField
                                register={register}
                                path={`${basePath}.model`}
                                placeholder="provider/model-id"
                                selectedModelId={watch(modelPath) as string | undefined}
                                onModelSelect={(modelId) =>
                                    setValue(modelPath, modelId as PathValue<OpencodeConfig, typeof modelPath>, { shouldDirty: true })
                                }
                                modelSelectorConfig={modelSelectorConfig}
                                isLoadingModels={isLoadingModels}
                                onRefreshModels={onRefreshModels}
                                isRefreshingModels={isRefreshingModels}
                            />
                            <VariantSelect
                                register={register}
                                path={`${basePath}.variant`}
                            />

                            {/* Temperature & Top P */}
                            <TemperatureSlider
                                watch={watch}
                                register={register}
                                path={`${basePath}.temperature`}
                            />
                            <TopPSlider
                                watch={watch}
                                register={register}
                                path={`${basePath}.top_p`}
                            />

                            {/* Thinking */}
                            <ThinkingConfig
                                watch={watch}
                                setValue={setValue}
                                basePath={basePath}
                            />

                            {/* Prompt */}
                            <PromptTextarea
                                label="Prompt"
                                register={register}
                                path={`${basePath}.prompt`}
                                rows={3}
                            />
                            <PromptTextarea
                                label="Prompt Append"
                                register={register}
                                path={`${basePath}.prompt_append`}
                                rows={3}
                            />

                            {/* Tools */}
                            <ToolsToggleGroup
                                watch={watch}
                                setValue={setValue}
                                basePath={basePath}
                            />

                            {/* Disabled */}
                            <SwitchField
                                label="禁用此 Category"
                                watch={watch}
                                setValue={setValue}
                                path={`${basePath}.disabled`}
                            />
                        </ConfigAccordion>
                    );
                })}
            </div>
        </div>
    );
}
