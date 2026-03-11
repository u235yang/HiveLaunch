"use client";

import { useFormContext } from "react-hook-form";
import type { OpencodeConfig } from "../schema";
import { ConfigAccordion } from "./containers/ConfigAccordion";
import { ConfigSection } from "./containers/ConfigSection";
import { SliderField, SwitchField, SelectField, TagsField, ModelField } from "./fields";

// 高级配置项信息
const advancedConfigInfo: Record<string, { name: string; description: string }> = {
    default_run_agent: { name: "Default Run Agent", description: "指定默认运行的 Agent" },
    background_task: { name: "Background Task", description: "后台任务并发控制" },
    sisyphus_agent: { name: "Sisyphus Agent", description: "Sisyphus 编排器配置" },
    git_master: { name: "Git Master", description: "Git 操作配置" },
    comment_checker: { name: "Comment Checker", description: "代码注释检查" },
    experimental: { name: "Experimental", description: "实验性功能" },
    auto_update: { name: "Auto Update", description: "自动更新" },
    skills: { name: "Global Skills", description: "全局技能列表" },
    disabled_hooks: { name: "Disabled Hooks", description: "禁用的 Hooks" },
    disabled_agents: { name: "Disabled Agents", description: "禁用的 Agents" },
    disabled_skills: { name: "Disabled Skills", description: "禁用的 Skills" },
    disabled_mcps: { name: "Disabled MCPs", description: "禁用的 MCPs" },
    disabled_commands: { name: "Disabled Commands", description: "禁用的 Commands" },
    disabled_tools: { name: "Disabled Tools", description: "禁用的 Tools" },
    browser_automation_engine: { name: "Browser Automation", description: "浏览器自动化引擎" },
    websearch: { name: "Websearch", description: "网页搜索提供者" },
    tmux: { name: "Tmux", description: "Tmux 分屏配置" },
    notification: { name: "Notification", description: "通知配置" },
    ralph_loop: { name: "Ralph Loop", description: "Ralph 循环配置" },
    babysitting: { name: "Babysitting", description: "超时配置" },
    sisyphus: { name: "Sisyphus Tasks", description: "Sisyphus 任务存储" },
};

interface AdvancedPanelProps {
    embedded?: boolean;
}

export default function AdvancedPanel({ embedded = false }: AdvancedPanelProps) {
    const { register, watch, setValue } = useFormContext<OpencodeConfig>();
    const config = watch();
    const configKeys = Object.keys(advancedConfigInfo);

    const agents = watch("agents") || {};

    return (
        <div className={embedded ? "p-4 space-y-4" : "h-full overflow-auto p-6"}>
            {/* 页面标题 */}
            {!embedded && (
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">高级配置</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">系统级配置选项</p>
                </div>
            )}

            {/* 功能说明 */}
            {!embedded && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">配置项说明</h3>
                    <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                        <li>• 点击展开查看和编辑配置</li>
                        <li>• 带 + 的项目支持添加子项</li>
                    </ul>
                </div>
            )}

            {/* 配置项手风琴列表 */}
            <div className="space-y-3">
                {configKeys.map((key) => {
                    const info = advancedConfigInfo[key];
                    const value = (config as any)[key];
                    const hasValue = value !== undefined && value !== null;

                    return (
                        <ConfigAccordion
                            key={key}
                            title={info.name}
                            subtitle={info.description}
                            defaultOpen={false}
                            badge={
                                <span className="text-xs text-slate-500">
                                    {hasValue ? (typeof value === 'boolean' ? (value ? "已启用" : "已禁用") : "已配置") : "未配置"}
                                </span>
                            }
                        >
                            {/* Default Run Agent */}
                            {key === "default_run_agent" && (
                                <SelectField
                                    label="Agent"
                                    register={register}
                                    path="default_run_agent"
                                    options={Object.keys(agents).filter(k => ["sisyphus", "hephaestus", "atlas"].includes(k)).map(k => ({ value: k, label: k }))}
                                />
                            )}

                            {/* Background Task */}
                            {key === "background_task" && (
                                <>
                                    <SliderField
                                        label="Default Concurrency"
                                        watch={watch}
                                        register={register}
                                        path="background_task.defaultConcurrency"
                                        min={1}
                                        max={50}
                                        formatValue={(v) => String(v)}
                                    />
                                    <SliderField
                                        label="Stale Timeout (ms)"
                                        watch={watch}
                                        register={register}
                                        path="background_task.staleTimeoutMs"
                                        min={60000}
                                        max={600000}
                                        step={10000}
                                        formatValue={(v) => `${(v/1000).toFixed(0)}s`}
                                    />
                                    <TagsField
                                        label="Provider Concurrency"
                                        watch={watch}
                                        setValue={setValue}
                                        path="background_task.providerConcurrency"
                                    />
                                    <TagsField
                                        label="Model Concurrency"
                                        watch={watch}
                                        setValue={setValue}
                                        path="background_task.modelConcurrency"
                                    />
                                </>
                            )}

                            {/* Sisyphus Agent */}
                            {key === "sisyphus_agent" && (
                                <>
                                    <SwitchField
                                        label="禁用 Sisyphus Agent"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus_agent.disabled"
                                    />
                                    <SwitchField
                                        label="默认 Builder 启用"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus_agent.default_builder_enabled"
                                    />
                                    <SwitchField
                                        label="Planner 启用"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus_agent.planner_enabled"
                                    />
                                    <SwitchField
                                        label="替换 Plan"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus_agent.replace_plan"
                                    />
                                </>
                            )}

                            {/* Git Master */}
                            {key === "git_master" && (
                                <>
                                    <SwitchField
                                        label="Commit Footer"
                                        watch={watch}
                                        setValue={setValue}
                                        path="git_master.commit_footer"
                                    />
                                    <SwitchField
                                        label="Include Co-Authored-By"
                                        watch={watch}
                                        setValue={setValue}
                                        path="git_master.include_co_authored_by"
                                    />
                                </>
                            )}

                            {/* Comment Checker */}
                            {key === "comment_checker" && (
                                <ConfigSection title="Custom Prompt" icon="edit_note">
                                    <textarea
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono"
                                        rows={3}
                                        {...register("comment_checker.custom_prompt")}
                                    />
                                </ConfigSection>
                            )}

                            {/* Experimental */}
                            {key === "experimental" && (
                                <>
                                    <SwitchField
                                        label="激进截断模式"
                                        description="强制缩短上下文以节省 token"
                                        watch={watch}
                                        setValue={setValue}
                                        path="experimental.aggressive_truncation"
                                    />
                                    <SwitchField
                                        label="自动恢复"
                                        description="中断后自动继续任务"
                                        watch={watch}
                                        setValue={setValue}
                                        path="experimental.auto_resume"
                                    />
                                    <SwitchField
                                        label="动态上下文修剪"
                                        description="自动清理冗余上下文"
                                        watch={watch}
                                        setValue={setValue}
                                        path="experimental.dynamic_context_pruning.enabled"
                                    />
                                    <TagsField
                                        label="Protected Tools"
                                        watch={watch}
                                        setValue={setValue}
                                        path="experimental.dynamic_context_pruning.protected_tools"
                                    />
                                </>
                            )}

                            {/* Auto Update */}
                            {key === "auto_update" && (
                                <SwitchField
                                    label="启用自动更新"
                                    description="自动检查并更新 oh-my-opencode 插件"
                                    watch={watch}
                                    setValue={setValue}
                                    path="auto_update"
                                />
                            )}

                            {/* Skills */}
                            {key === "skills" && (
                                <TagsField
                                    label="Global Skills"
                                    watch={watch}
                                    setValue={setValue}
                                    path="skills"
                                />
                            )}

                            {/* Disabled Lists */}
                            {key.startsWith("disabled_") && (
                                <TagsField
                                    label={info.name}
                                    watch={watch}
                                    setValue={setValue}
                                    path={key}
                                />
                            )}

                            {/* Browser Automation */}
                            {key === "browser_automation_engine" && (
                                <SelectField
                                    label="Provider"
                                    register={register}
                                    path="browser_automation_engine.provider"
                                    options={[
                                        { value: "playwright", label: "Playwright" },
                                        { value: "agent-browser", label: "Agent Browser" },
                                        { value: "dev-browser", label: "Dev Browser" },
                                    ]}
                                />
                            )}

                            {/* Websearch */}
                            {key === "websearch" && (
                                <SelectField
                                    label="Provider"
                                    register={register}
                                    path="websearch.provider"
                                    options={[
                                        { value: "exa", label: "Exa" },
                                        { value: "tavily", label: "Tavily" },
                                    ]}
                                />
                            )}

                            {/* Tmux */}
                            {key === "tmux" && (
                                <>
                                    <SwitchField
                                        label="启用 Tmux"
                                        watch={watch}
                                        setValue={setValue}
                                        path="tmux.enabled"
                                    />
                                    <SelectField
                                        label="Layout"
                                        register={register}
                                        path="tmux.layout"
                                        options={[
                                            { value: "main-horizontal", label: "Main Horizontal" },
                                            { value: "main-vertical", label: "Main Vertical" },
                                            { value: "even-horizontal", label: "Even Horizontal" },
                                            { value: "even-vertical", label: "Even Vertical" },
                                        ]}
                                    />
                                    <SliderField
                                        label="Main Pane Size"
                                        watch={watch}
                                        register={register}
                                        path="tmux.main_pane_size"
                                        min={20}
                                        max={80}
                                        formatValue={(v) => `${v}%`}
                                    />
                                </>
                            )}

                            {/* Notification */}
                            {key === "notification" && (
                                <SwitchField
                                    label="强制启用通知"
                                    watch={watch}
                                    setValue={setValue}
                                    path="notification.force_enable"
                                />
                            )}

                            {/* Ralph Loop */}
                            {key === "ralph_loop" && (
                                <>
                                    <SwitchField
                                        label="启用 Ralph Loop"
                                        watch={watch}
                                        setValue={setValue}
                                        path="ralph_loop.enabled"
                                    />
                                    <SliderField
                                        label="Max Iterations"
                                        watch={watch}
                                        register={register}
                                        path="ralph_loop.default_max_iterations"
                                        min={10}
                                        max={500}
                                        formatValue={(v) => String(v)}
                                    />
                                </>
                            )}

                            {/* Babysitting */}
                            {key === "babysitting" && (
                                <SliderField
                                    label="Timeout (ms)"
                                    watch={watch}
                                    register={register}
                                    path="babysitting.timeout_ms"
                                    min={30000}
                                    max={300000}
                                    step={10000}
                                    formatValue={(v) => `${(v/1000).toFixed(0)}s`}
                                />
                            )}

                            {/* Sisyphus Tasks */}
                            {key === "sisyphus" && (
                                <>
                                    <SwitchField
                                        label="启用 Tasks"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus.tasks.enabled"
                                    />
                                    <ModelField
                                        label="Storage Path"
                                        register={register}
                                        path="sisyphus.tasks.storage_path"
                                        placeholder=".sisyphus/tasks"
                                    />
                                    <SwitchField
                                        label="Claude Code 兼容"
                                        watch={watch}
                                        setValue={setValue}
                                        path="sisyphus.tasks.claude_code_compat"
                                    />
                                </>
                            )}
                        </ConfigAccordion>
                    );
                })}
            </div>
        </div>
    );
}
