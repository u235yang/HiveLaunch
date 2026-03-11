"use client";

import { useState, useMemo } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parse, stripComments } from "jsonc-parser";
import { opencodeConfigSchema, defaultMockConfig, type OpencodeConfig } from "./schema";

import ConfigLayout from "./components/ConfigLayout";
import AgentPanel from "./components/AgentPanel";
import CategoryPanel from "./components/CategoryPanel";
import AdvancedPanel from "./components/AdvancedPanel";

type NavSection = "agents-primary" | "agents-sub" | "agents-system" | "categories" | "advanced";

export interface OpencodeVisualizerProps {
    value: string;
    onChange: (value: string) => void;
    onClose: () => void;
}

export function OpencodeVisualizer({ value, onChange, onClose }: OpencodeVisualizerProps) {
    const [showPreview, setShowPreview] = useState(false);

    // 解析 JSONC（使用 jsonc-parser 正确处理注释）
    const parseJSONC = (str: string): any => {
        try {
            // stripComments 会移除 // 和 /* */ 注释，不会错误删除字符串内的内容
            const cleanStr = stripComments(str);
            return parse(cleanStr);
        } catch (e) {
            console.error("Failed to parse JSONC:", e);
            return null;
        }
    };

    // Parse initial config
    const initialConfig = useMemo(() => {
        if (value && value.trim() !== "") {
            const parsed = parseJSONC(value);
            if (parsed) return parsed;
        }
        return defaultMockConfig;
    }, [value]);

    const methods = useForm<OpencodeConfig>({
        resolver: zodResolver(opencodeConfigSchema),
        defaultValues: initialConfig,
    });

    const onSubmit = (data: OpencodeConfig) => {
        onChange(JSON.stringify(data, null, 2));
        onClose();
    };

    // 渲染内容
    const renderContent = (section: NavSection) => {
        if (showPreview) {
            return (
                <div className="h-full p-6 overflow-auto">
                    <div className="bg-slate-900 rounded-xl p-6 shadow-xl text-slate-300 font-mono text-xs h-full overflow-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-bold text-lg">Live JSON Preview</h3>
                            <button type="button" onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-white">Close</button>
                        </div>
                        <pre>{JSON.stringify(methods.watch(), null, 2)}</pre>
                    </div>
                </div>
            );
        }

        // 渲染面板
        switch (section) {
            case "agents-primary":
                return <AgentPanel type="primary" />;
            case "agents-sub":
                return <AgentPanel type="sub" />;
            case "agents-system":
                return <AgentPanel type="system" />;
            case "categories":
                return <CategoryPanel />;
            case "advanced":
                return <AdvancedPanel />;
            default:
                return <AgentPanel type="primary" />;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col">
            <FormProvider {...methods}>
                <form onSubmit={methods.handleSubmit(onSubmit)} className="h-full w-full">
                    <ConfigLayout
                        onPreviewClick={() => setShowPreview(!showPreview)}
                        onClose={onClose}
                    >
                        {renderContent}
                    </ConfigLayout>
                </form>
            </FormProvider>
        </div>
    );
}
