"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../../components/ui/tabs";
import { Button } from "../../../../Button";
import { FileJson } from "lucide-react";
import AgentPanel from "./AgentPanel";
import CategoryPanel from "./CategoryPanel";
import AdvancedPanel from "./AdvancedPanel";
import type { OpencodeConfig } from "../schema";

type NavSection = "agents-primary" | "agents-sub" | "agents-system" | "categories" | "advanced";

interface EmbeddedConfigEditorProps {
    defaultSection?: NavSection;
    availableSkills?: string[];
    modelSelectorConfig?: {
        providers: Array<{ id: string; name: string }>;
        models: Array<{ id: string; name: string; provider_id?: string }>;
    };
    isLoadingModels?: boolean;
    onRefreshModels?: () => void;
    isRefreshingModels?: boolean;
}

const tabs: { id: NavSection; label: string }[] = [
    { id: "agents-primary", label: "主代理" },
    { id: "agents-sub", label: "子代理" },
    { id: "agents-system", label: "系统代理" },
    { id: "categories", label: "Categories" },
    { id: "advanced", label: "高级" },
];

export function EmbeddedConfigEditor({
    defaultSection = "agents-primary",
    availableSkills = [],
    modelSelectorConfig,
    isLoadingModels = false,
    onRefreshModels,
    isRefreshingModels = false,
}: EmbeddedConfigEditorProps) {
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [activeTab, setActiveTab] = useState<NavSection>(defaultSection);
    const { watch } = useFormContext<OpencodeConfig>();
    const formData = watch();

    return (
        <div className="w-full h-full flex flex-col relative">
            {/* Tabs 导航 + 预览按钮 */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 shrink-0">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NavSection)} className="w-full flex-1">
                    <TabsList className="w-full justify-start bg-transparent rounded-none h-auto p-0">
                        {tabs.map((tab) => (
                            <TabsTrigger
                                key={tab.id}
                                value={tab.id}
                                className="rounded-none px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* 预览 JSON 按钮 */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="mr-2 h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                >
                    <FileJson className="w-3.5 h-3.5 mr-1" />
                    {showJsonPreview ? "隐藏 JSON" : "预览 JSON"}
                </Button>
            </div>

            {/* 主内容区域 */}
            <div className="flex-1 overflow-hidden flex">
                {/* 配置面板 */}
                <div className={`flex-1 overflow-auto ${showJsonPreview ? "hidden" : ""}`}>
                    <Tabs value={activeTab} className="h-full">
                        <TabsContent value="agents-primary" className="m-0 h-full">
                            <AgentPanel
                                type="primary"
                                embedded
                                availableSkills={availableSkills}
                                modelSelectorConfig={modelSelectorConfig}
                                isLoadingModels={isLoadingModels}
                                onRefreshModels={onRefreshModels}
                                isRefreshingModels={isRefreshingModels}
                            />
                        </TabsContent>
                        <TabsContent value="agents-sub" className="m-0 h-full">
                            <AgentPanel
                                type="sub"
                                embedded
                                availableSkills={availableSkills}
                                modelSelectorConfig={modelSelectorConfig}
                                isLoadingModels={isLoadingModels}
                                onRefreshModels={onRefreshModels}
                                isRefreshingModels={isRefreshingModels}
                            />
                        </TabsContent>
                        <TabsContent value="agents-system" className="m-0 h-full">
                            <AgentPanel
                                type="system"
                                embedded
                                availableSkills={availableSkills}
                                modelSelectorConfig={modelSelectorConfig}
                                isLoadingModels={isLoadingModels}
                                onRefreshModels={onRefreshModels}
                                isRefreshingModels={isRefreshingModels}
                            />
                        </TabsContent>
                        <TabsContent value="categories" className="m-0 h-full">
                            <CategoryPanel
                                embedded
                                modelSelectorConfig={modelSelectorConfig}
                                isLoadingModels={isLoadingModels}
                                onRefreshModels={onRefreshModels}
                                isRefreshingModels={isRefreshingModels}
                            />
                        </TabsContent>
                        <TabsContent value="advanced" className="m-0 h-full">
                            <AdvancedPanel embedded />
                        </TabsContent>
                    </Tabs>
                </div>

                {/* JSON 预览面板 - 只读 */}
                {showJsonPreview && (
                    <div className="flex-1 overflow-auto bg-slate-900 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-slate-400 font-medium">oh-my-opencode.jsonc</span>
                            <span className="text-xs text-slate-500">只读预览</span>
                        </div>
                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                            {JSON.stringify(formData, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
