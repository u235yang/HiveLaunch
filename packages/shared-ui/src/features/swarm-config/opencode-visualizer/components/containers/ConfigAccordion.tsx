"use client";

import { useState } from "react";

interface ConfigAccordionProps {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    disabled?: boolean;
    badge?: React.ReactNode;
    children: React.ReactNode;
}

export function ConfigAccordion({ 
    title, 
    subtitle, 
    defaultOpen = false, 
    disabled = false,
    badge,
    children 
}: ConfigAccordionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    if (disabled) {
        return null;
    }

    return (
        <div className="bg-white dark:bg-[#1a160e] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header - 始终可点击 */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="text-left">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                        </span>
                        {subtitle && (
                            <p className="text-xs text-slate-500">{subtitle}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {badge && <div>{badge}</div>}
                    <span className={`material-symbols-outlined text-[20px] text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        expand_more
                    </span>
                </div>
            </button>

            {/* Content */}
            {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                    {children}
                </div>
            )}
        </div>
    );
}
