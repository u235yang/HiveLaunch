"use client";

import { useState, useMemo } from "react";
import { cn } from "../../../../lib/utils";

// 导航类型
type NavSection = "agents-primary" | "agents-sub" | "agents-system" | "categories" | "advanced";

interface NavItem {
    id: string;
    name: string;
    icon: string;
    description?: string;
}

interface ConfigLayoutProps {
    children: (section: NavSection, activeId?: string) => React.ReactNode;
    onPreviewClick?: () => void;
    onClose?: () => void;
}

const navItems: { id: NavSection; name: string; icon: string; description: string }[] = [
    { 
        id: "agents-primary", 
        name: "主代理", 
        icon: "smart_toy",
        description: "用户直接交互的智能体"
    },
    { 
        id: "agents-sub", 
        name: "子代理", 
        icon: "account_tree",
        description: "被委派调用的智能体"
    },
    { 
        id: "agents-system", 
        name: "系统代理", 
        icon: "settings",
        description: "内部使用的智能体"
    },
    { 
        id: "categories", 
        name: "Categories", 
        icon: "category",
        description: "任务分类与模型映射"
    },
    { 
        id: "advanced", 
        name: "高级配置", 
        icon: "tune",
        description: "全局配置与功能开关"
    },
];

export default function ConfigLayout({ children, onPreviewClick, onClose }: ConfigLayoutProps) {
    const [activeSection, setActiveSection] = useState<NavSection>("agents-primary");
    const [selectedItem, setSelectedItem] = useState<string | null>(null);

    const handleSectionClick = (section: NavSection) => {
        setActiveSection(section);
        setSelectedItem(null);
    };

    const handleItemClick = (itemId: string) => {
        setSelectedItem(itemId);
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display antialiased h-[100dvh] flex overflow-hidden w-full">
            {/* Sidebar - 简单的一级导航 */}
            <aside className="w-64 bg-white dark:bg-[#1a160e] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-colors duration-200">
                {/* Sidebar Header */}
                <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/50">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg w-8 h-8 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-[20px]">
                            hive
                        </span>
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Agent 配置
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            oh-my-opencode
                        </p>
                    </div>
                </div>

                {/* 一级导航 */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSectionClick(item.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors relative",
                                activeSection === item.id
                                    ? "bg-primary/10 text-primary dark:text-primary dark:bg-primary/20"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            )}
                        >
                            {activeSection === item.id && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-primary rounded-r-full"></span>
                            )}
                            <span className="material-symbols-outlined text-[20px]">
                                {item.icon}
                            </span>
                            <div className="flex-1 text-left">
                                <div>{item.name}</div>
                                <div className="text-xs text-slate-400 font-normal">{item.description}</div>
                            </div>
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#F9FAFB] dark:bg-[#121212]">
                {/* Header */}
                <header className="flex-none h-16 px-8 flex items-center justify-between bg-white/80 dark:bg-[#1a160e]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10 sticky top-0">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <nav className="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400">
                            <span className="text-slate-900 dark:text-slate-100">
                                {navItems.find(n => n.id === activeSection)?.name}
                            </span>
                            {selectedItem && (
                                <>
                                    <span className="mx-2 text-slate-300 dark:text-slate-600">/</span>
                                    <span className="text-slate-900 dark:text-slate-100">{selectedItem}</span>
                                </>
                            )}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onPreviewClick}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[18px]">data_object</span>
                            预览 JSON
                        </button>
                        <button type="submit" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-orange-600 transition-all shadow-sm hover:shadow-md">
                            <span className="material-symbols-outlined text-[18px]">save</span>
                            保存
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                    {children(activeSection, selectedItem || undefined)}
                </div>
            </main>
        </div>
    );
}
