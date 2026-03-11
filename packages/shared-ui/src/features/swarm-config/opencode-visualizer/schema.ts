import { z } from "zod";

// ========================================================================
// Agent 配置 Schema
// ========================================================================
export const permissionSchema = z.object({
    edit: z.enum(["allow", "ask", "deny"]).optional(),
    bash: z.enum(["allow", "ask", "deny"]).optional(),
    webfetch: z.enum(["allow", "ask", "deny"]).optional(),
    task: z.enum(["allow", "ask", "deny"]).optional(),
    grep: z.enum(["allow", "ask", "deny"]).optional(),
    glob: z.enum(["allow", "ask", "deny"]).optional(),
    read: z.enum(["allow", "ask", "deny"]).optional(),
    write: z.enum(["allow", "ask", "deny"]).optional(),
}).optional();

export const thinkingSchema = z.object({
    type: z.enum(["enabled", "disabled"]).optional(),
    budgetTokens: z.number().min(50000).max(500000).optional(),
});

export const agentConfigSchema = z.object({
    // 模型配置
    model: z.string().optional(),
    variant: z.enum(["max", "high", "medium", "low", "xhigh"]).optional(),
    category: z.string().optional(),
    
    // 温度参数
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    
    // 提示词
    prompt: z.string().optional(),
    prompt_append: z.string().optional(),
    
    // Skills
    skills: z.array(z.string()).optional(),
    mcps: z.array(z.string()).optional(),
    
    // Agent 状态
    disabled: z.boolean().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
    mode: z.enum(["subagent", "primary", "all"]).optional(),
    
    // Token 限制
    maxTokens: z.number().optional(),
    
    // 推理配置 (OpenAI)
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    textVerbosity: z.enum(["low", "medium", "high"]).optional(),
    
    // 扩展思考 (Anthropic)
    thinking: thinkingSchema.optional(),
    
    // 工具配置
    tools: z.record(z.boolean()).optional(),
    
    // 权限配置
    permission: permissionSchema,
});

// ========================================================================
// Category 配置 Schema
// ========================================================================
export const categoryConfigSchema = z.object({
    // 基础配置
    description: z.string().optional(),
    model: z.string().optional(),
    variant: z.enum(["max", "high", "medium", "low", "xhigh"]).optional(),
    
    // 温度参数
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    
    // 提示词
    prompt_append: z.string().optional(),
    prompt: z.string().optional(),
    
    // 推理配置
    thinking: thinkingSchema.optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    textVerbosity: z.enum(["low", "medium", "high"]).optional(),
    
    // 工具配置
    tools: z.record(z.boolean()).optional(),
    
    // Agent 状态
    is_unstable_agent: z.boolean().optional(),
    disabled: z.boolean().optional(),
});

// ========================================================================
// Background Task 配置 Schema
// ========================================================================
export const backgroundTaskSchema = z.object({
    defaultConcurrency: z.number().min(1).max(50).optional(),
    staleTimeoutMs: z.number().min(60000).optional(),
    providerConcurrency: z.record(z.number()).optional(),
    modelConcurrency: z.record(z.number()).optional(),
});

// ========================================================================
// Sisyphus Agent 配置 Schema
// ========================================================================
export const sisyphusAgentSchema = z.object({
    disabled: z.boolean().optional(),
    default_builder_enabled: z.boolean().optional(),
    planner_enabled: z.boolean().optional(),
    replace_plan: z.boolean().optional(),
});

// ========================================================================
// Git Master 配置 Schema
// ========================================================================
export const gitMasterSchema = z.object({
    commit_footer: z.boolean().optional(),
    include_co_authored_by: z.boolean().optional(),
});

// ========================================================================
// Comment Checker 配置 Schema
// ========================================================================
export const commentCheckerSchema = z.object({
    custom_prompt: z.string().optional(),
});

// ========================================================================
// Experimental 配置 Schema
// ========================================================================
export const experimentalSchema = z.object({
    aggressive_truncation: z.boolean().optional(),
    auto_resume: z.boolean().optional(),
    preemptive_compaction: z.boolean().optional(),
    truncate_all_tool_outputs: z.boolean().optional(),
    dynamic_context_pruning: z.object({
        enabled: z.boolean().optional(),
        notification: z.enum(["minimal", "normal", "verbose"]).optional(),
        turn_protection: z.object({
            enabled: z.boolean().optional(),
            turns: z.number().optional(),
        }).optional(),
        protected_tools: z.array(z.string()).optional(),
        strategies: z.object({
            deduplication: z.object({
                enabled: z.boolean().optional(),
            }).optional(),
            supersede_writes: z.object({
                enabled: z.boolean().optional(),
            }).optional(),
            purge_errors: z.object({
                enabled: z.boolean().optional(),
                turns: z.number().optional(),
            }).optional(),
        }).optional(),
    }).optional(),
});

// ========================================================================
// Browser Automation 配置 Schema
// ========================================================================
export const browserAutomationSchema = z.object({
    provider: z.enum(["playwright", "agent-browser", "dev-browser"]).optional(),
});

// ========================================================================
// Websearch 配置 Schema
// ========================================================================
export const websearchSchema = z.object({
    provider: z.enum(["exa", "tavily"]).optional(),
});

// ========================================================================
// Tmux 配置 Schema
// ========================================================================
export const tmuxSchema = z.object({
    enabled: z.boolean().optional(),
    layout: z.enum(["main-horizontal", "main-vertical", "even-horizontal", "even-vertical"]).optional(),
    main_pane_size: z.number().min(0).max(100).optional(),
    main_pane_min_width: z.number().optional(),
    agent_pane_min_width: z.number().optional(),
});

// ========================================================================
// Notification 配置 Schema
// ========================================================================
export const notificationSchema = z.object({
    force_enable: z.boolean().optional(),
});

// ========================================================================
// Ralph Loop 配置 Schema
// ========================================================================
export const ralphLoopSchema = z.object({
    enabled: z.boolean().optional(),
    default_max_iterations: z.number().optional(),
    state_dir: z.string().optional(),
});

// ========================================================================
// Babysitting 配置 Schema
// ========================================================================
export const babysittingSchema = z.object({
    timeout_ms: z.number().optional(),
});

// ========================================================================
// Sisyphus Tasks 配置 Schema
// ========================================================================
export const sisyphusTasksSchema = z.object({
    enabled: z.boolean().optional(),
    storage_path: z.string().optional(),
    claude_code_compat: z.boolean().optional(),
});

export const sisyphusSchema = z.object({
    tasks: sisyphusTasksSchema.optional(),
});

// ========================================================================
// 主配置文件 Schema
// ========================================================================
export const opencodeConfigSchema = z.object({
    // 基础配置
    $schema: z.string().optional(),
    default_run_agent: z.string().optional(),
    
    // Agents 配置
    agents: z.record(agentConfigSchema).optional(),
    
    // Categories 配置
    categories: z.record(categoryConfigSchema).optional(),
    
    // Background Task 配置
    background_task: backgroundTaskSchema.optional(),
    
    // Sisyphus Agent 配置
    sisyphus_agent: sisyphusAgentSchema.optional(),
    
    // Git Master 配置
    git_master: gitMasterSchema.optional(),
    
    // Comment Checker 配置
    comment_checker: commentCheckerSchema.optional(),
    
    // Experimental 配置
    experimental: experimentalSchema.optional(),
    
    // 自动更新
    auto_update: z.boolean().optional(),
    
    // Skills (全局)
    skills: z.array(z.string()).optional(),
    
    // 禁用列表
    disabled_hooks: z.array(z.string()).optional(),
    disabled_agents: z.array(z.string()).optional(),
    disabled_skills: z.array(z.string()).optional(),
    disabled_mcps: z.array(z.string()).optional(),
    disabled_commands: z.array(z.string()).optional(),
    disabled_tools: z.array(z.string()).optional(),
    
    // Browser Automation
    browser_automation_engine: browserAutomationSchema.optional(),
    
    // Websearch
    websearch: websearchSchema.optional(),
    
    // Tmux
    tmux: tmuxSchema.optional(),
    
    // Notification
    notification: notificationSchema.optional(),
    
    // Ralph Loop
    ralph_loop: ralphLoopSchema.optional(),
    
    // Babysitting
    babysitting: babysittingSchema.optional(),
    
    // Sisyphus Tasks
    sisyphus: sisyphusSchema.optional(),
});

export type OpencodeConfig = z.infer<typeof opencodeConfigSchema>;

// ========================================================================
// 默认配置 (基于实际 oh-my-opencode.jsonc)
// ========================================================================
export const defaultMockConfig: OpencodeConfig = {
    $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
    default_run_agent: "sisyphus",
    agents: {
        sisyphus: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
            temperature: 0.7,
            top_p: 0.9,
            thinking: {
                type: "enabled",
                budgetTokens: 200000,
            },
            skills: [
                "vercel-react-best-practices",
                "tailwind-v4-shadcn",
                "tanstack-query-best-practices",
                "zustand-state-management",
                "typescript-expert",
                "emilkowal-animations",
                "ui-ux-pro-max",
                "rust-desktop-applications",
                "drizzle-orm",
                "using-git-worktrees",
            ],
            prompt_append: "## 任务委派 Skills 加载规则\n\n委派任务时，根据任务类型使用 task(load_skills: [...]) 加载对应技能...",
        },
        prometheus: {
            model: "zai-coding-plan/glm-5",
        },
        metis: {
            model: "opencode/kimi-k2.5-free",
        },
        momus: {
            model: "opencode/kimi-k2.5-free",
        },
        oracle: {
            model: "zai-coding-plan/glm-5",
            permission: {
                edit: "deny",
                bash: "deny",
            },
        },
        librarian: {
            category: "research",
        },
        explore: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        "multimodal-looker": {
            model: "opencode/kimi-k2.5-free",
        },
        hephaestus: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        atlas: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        "sisyphus-junior": {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        build: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        plan: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        "OpenCode-Builder": {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
    },
    categories: {
        "visual-engineering": {
            model: "opencode/kimi-k2.5-free",
            prompt_append: "专注于 UI/UX 实现，优先使用 Tailwind CSS",
        },
        ultrabrain: {
            model: "zai-coding-plan/glm-5",
            thinking: {
                type: "enabled",
                budgetTokens: 300000,
            },
        },
        deep: {
            model: "zai-coding-plan/glm-5",
        },
        artistry: {
            model: "opencode/kimi-k2.5-free",
            temperature: 1.0,
        },
        quick: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        "unspecified-low": {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
        },
        "unspecified-high": {
            model: "zai-coding-plan/glm-5",
        },
        writing: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
            temperature: 0.8,
        },
        research: {
            model: "minimax-cn-coding-plan/MiniMax-M2.5",
            description: "文档研究与外部信息检索，优先使用 MCP 工具",
            prompt_append: "## 研究任务专用指令\n\n你是研究员/文献管理员...",
        },
    },
    background_task: {
        defaultConcurrency: 10,
        staleTimeoutMs: 180000,
        providerConcurrency: {
            default: 5,
            "zai-coding-plan": 5,
            opencode: 5,
        },
        modelConcurrency: {
            "opencode/kimi-k2.5-free": 1,
        },
    },
    sisyphus_agent: {
        disabled: false,
        default_builder_enabled: true,
        planner_enabled: true,
        replace_plan: false,
    },
    git_master: {
        commit_footer: true,
        include_co_authored_by: true,
    },
    comment_checker: {
        custom_prompt: "只保留解释 WHY 的注释，删除解释 WHAT 的注释",
    },
    experimental: {
        aggressive_truncation: false,
        auto_resume: true,
        dynamic_context_pruning: {
            enabled: true,
            notification: "minimal",
            turn_protection: {
                enabled: true,
                turns: 3,
            },
            protected_tools: [
                "task",
                "todowrite",
                "todoread",
                "lsp_rename",
                "session_read",
                "session_write",
            ],
            strategies: {
                deduplication: { enabled: true },
                supersede_writes: { enabled: true },
                purge_errors: { enabled: true, turns: 5 },
            },
        },
    },
    auto_update: true,
    skills: ["idea-stitch"],
    disabled_hooks: [],
    disabled_agents: [],
    disabled_skills: [],
    disabled_mcps: [],
    disabled_commands: [],
    disabled_tools: [],
    browser_automation_engine: {
        provider: "playwright",
    },
    websearch: {
        provider: "exa",
    },
    tmux: {
        enabled: false,
        layout: "main-vertical",
        main_pane_size: 60,
        main_pane_min_width: 120,
        agent_pane_min_width: 40,
    },
    notification: {
        force_enable: false,
    },
    ralph_loop: {
        enabled: false,
        default_max_iterations: 100,
        state_dir: ".opencode/",
    },
    babysitting: {
        timeout_ms: 120000,
    },
    sisyphus: {
        tasks: {
            storage_path: ".sisyphus/tasks",
            claude_code_compat: false,
        },
    },
};
