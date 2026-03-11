"use client";

interface ConfigSectionProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

export function ConfigSection({ title, icon, children }: ConfigSectionProps) {
    return (
        <div className="bg-white dark:bg-[#1a160e] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {icon && <span className="material-symbols-outlined text-primary">{icon}</span>}
                    {title}
                </h3>
            </div>
            <div className="p-4 space-y-3">
                {children}
            </div>
        </div>
    );
}
