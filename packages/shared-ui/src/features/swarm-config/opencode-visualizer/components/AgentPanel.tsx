"use client";

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
    TagsField,
    ToolsToggleGroup,
    SwitchField,
    SelectField,
} from "./fields";

// Agent 信息
const agentInfo: Record<string, { name: string; description: string }> = {
    sisyphus: { name: "Sisyphus", description: "主编排智能体 - 任务分发、多智能体协调、工作流控制" },
    prometheus: { name: "Prometheus", description: "规划智能体 - 任务规划、需求分析、步骤拆解" },
    metis: { name: "Metis", description: "审查智能体 - 计划审查、风险评估、质量检查" },
    momus: { name: "Momus", description: "评审智能体 - 结果评审、反馈收集、改进建议" },
    oracle: { name: "Oracle", description: "架构与调试智能体 - 代码架构分析、复杂问题诊断" },
    librarian: { name: "Librarian", description: "文档检索智能体 - 代码搜索、文档查询、外部研究" },
    explore: { name: "Explore", description: "代码库探索智能体 - 快速浏览代码库、查找文件" },
    "multimodal-looker": { name: "Multimodal-Looker", description: "多媒体智能体 - 处理图像、视频等多媒体内容" },
    hephaestus: { name: "Hephaestus", description: "重构智能体 - 代码重构、LSP集成、AST操作" },
    atlas: { name: "Atlas", description: "Hook智能体 - 7阶段工作流编排、上下文累积、会话恢复" },
    "sisyphus-junior": { name: "Sisyphus-Junior", description: "任务委派子代理 - 通过task创建临时代理" },
    build: { name: "Build", description: "OpenCode默认构建代理" },
    plan: { name: "Plan", description: "OpenCode默认计划代理" },
    "OpenCode-Builder": { name: "OpenCode-Builder", description: "重命名的OpenCode构建代理" },
};

// Agent 分类映射
type AgentType = "primary" | "sub" | "system";
const agentTypeMap: Record<string, AgentType> = {
    sisyphus: "primary", hephaestus: "primary", atlas: "primary",
    prometheus: "sub", metis: "sub", momus: "sub", oracle: "sub",
    librarian: "sub", explore: "sub", "multimodal-looker": "sub",
    "sisyphus-junior": "system", build: "system", plan: "system", "OpenCode-Builder": "system",
};

function resolveAgentType(key: string, config: Record<string, unknown>): AgentType {
    const mappedType = agentTypeMap[key];
    if (mappedType) return mappedType;
    if (config.mode === "primary") return "primary";
    if (key === "sisyphus") return "primary";
    if (key === "build" || key === "plan" || key.includes("junior") || key.includes("builder")) return "system";
    return "sub";
}

const typeLabels: Record<AgentType, { title: string; desc: string }> = {
    primary: { title: "主代理 (Primary)", desc: "用户直接交互的智能体" },
    sub: { title: "子代理 (Subagent)", desc: "被委派调用的智能体" },
    system: { title: "系统代理 (System)", desc: "内部使用的智能体" },
};

interface AgentPanelProps {
    type: AgentType;
    embedded?: boolean;
    availableSkills?: string[];
    modelSelectorConfig?: {
        providers: Array<{ id: string; name: string }>;
        models: Array<{ id: string; name: string; provider_id?: string }>;
    };
    isLoadingModels?: boolean;
    onRefreshModels?: () => void;
    isRefreshingModels?: boolean;
}

export default function AgentPanel({
    type,
    embedded = false,
    availableSkills = [],
    modelSelectorConfig,
    isLoadingModels = false,
    onRefreshModels,
    isRefreshingModels = false,
}: AgentPanelProps) {
    const { register, watch, setValue } = useFormContext<OpencodeConfig>();
    const agents = watch("agents") || {};

    // 筛选当前类型的 Agent
    const filteredAgents = Object.entries(agents).filter(([key, config]) => resolveAgentType(key, config as Record<string, unknown>) === type);
    const titleInfo = typeLabels[type];

    return (
        <div className={embedded ? "p-4 space-y-4" : "h-full overflow-auto p-6"}>
            {/* 页面标题 */}
            {!embedded && (
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{titleInfo.title}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{titleInfo.desc}</p>
                </div>
            )}

            {/* 功能说明 - 嵌入模式下简化 */}
            {!embedded && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Agent 配置选项说明</h3>
                    <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                        <li>• model: 使用的模型 (格式: "provider/model-id")</li>
                        <li>• variant: 模型变体 (max/high/medium/low/xhigh)</li>
                        <li>• temperature: 温度参数 (0-2)</li>
                        <li>• top_p: 核采样参数 (0-1)</li>
                        <li>• skills: 默认加载的技能列表</li>
                        <li>• thinking: 扩展思考配置 (Anthropic)</li>
                        <li>• prompt_append: 追加到系统提示词</li>
                        <li>• permission: 权限控制</li>
                        <li>• tools: 工具开关</li>
                        <li>• mode: 代理模式 (subagent/primary/all)</li>
                        <li>• disabled: 是否禁用</li>
                    </ul>
                </div>
            )}

            {/* Agent 手风琴列表 */}
            <div className="space-y-3">
                {filteredAgents.map(([key, config]) => {
                    const info = agentInfo[key] || { name: key, description: "" };
                    const basePath = `agents.${key}`;
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

                            {/* Skills */}
                            <TagsField
                                label="Skills"
                                watch={watch}
                                setValue={setValue}
                                path={`${basePath}.skills`}
                                candidateTags={availableSkills}
                            />

                            {/* Thinking */}
                            <ThinkingConfig
                                watch={watch}
                                setValue={setValue}
                                basePath={basePath}
                            />

                            {/* Prompt Append */}
                            <PromptTextarea
                                label="Prompt Append"
                                register={register}
                                path={`${basePath}.prompt_append`}
                                rows={3}
                            />

                            {/* Permission */}
                            {config.permission && Object.keys(config.permission).length > 0 && (
                                <ConfigSection title="Permission" icon="security">
                                    {Object.entries(config.permission as Record<string, string>).map(([permKey, permValue]) => (
                                        <SelectField
                                            key={permKey}
                                            label={permKey}
                                            register={register}
                                            path={`${basePath}.permission.${permKey}`}
                                            options={[
                                                { value: "allow", label: "Allow" },
                                                { value: "ask", label: "Ask" },
                                                { value: "deny", label: "Deny" },
                                            ]}
                                        />
                                    ))}
                                </ConfigSection>
                            )}

                            {/* Tools */}
                            <ToolsToggleGroup
                                watch={watch}
                                setValue={setValue}
                                basePath={basePath}
                            />

                            {/* Mode */}
                            <SelectField
                                label="Mode"
                                register={register}
                                path={`${basePath}.mode`}
                                options={[
                                    { value: "subagent", label: "Subagent" },
                                    { value: "primary", label: "Primary" },
                                    { value: "all", label: "All" },
                                ]}
                            />

                            {/* Disabled */}
                            <SwitchField
                                label="禁用此代理"
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
