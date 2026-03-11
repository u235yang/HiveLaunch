// features/scaffold/lib/template-registry.ts

export interface TemplateVariable {
  id: string;
  name: string;
  defaultValue: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
}

export interface AgentConfigOverlay {
  name: string;
  description: string;
  model: string;
  tools: string[];
}

export interface McpConfig {
  name: string;
  description: string;
  steps: string[];
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  repoUrl: string; // Gitee repository URL
  variables: TemplateVariable[];
  agentConfigOverlay?: AgentConfigOverlay;
  mcpConfig?: McpConfig;
}

export const TEMPLATE_REGISTRY: TemplateConfig[] = [
  {
    id: 'expo-template',
    name: 'Expo React Native App',
    description: '一个基于 Expo 和 React Native 的移动应用模板，适合快速启动跨平台项目。',
    repoUrl: 'https://gitee.com/opencode-templates/expo-template.git', // Placeholder URL
    variables: [
      {
        id: 'PROJECT_NAME',
        name: '项目名称 (kebab-case)',
        defaultValue: 'my-expo-app',
        description: '项目的英文名称，例如：my-expo-app',
        required: true,
        type: 'string',
      },
      {
        id: 'DISPLAY_NAME',
        name: '应用显示名称',
        defaultValue: 'My Expo App',
        description: '应用在手机上显示的名称，例如：我的 Expo 应用',
        required: true,
        type: 'string',
      },
      {
        id: 'BUNDLE_ID',
        name: 'Bundle ID (iOS) / Package Name (Android)',
        defaultValue: 'com.myexpoapp',
        description: '应用的唯一标识符，例如：com.mycompany.myexpoapp',
        required: true,
        type: 'string',
      },
    ],
    agentConfigOverlay: {
      name: 'ExpoAgent',
      description: '针对 Expo 项目优化的 Agent 配置',
      model: 'claude-3-opus-20240229', // Example model
      tools: ['file_system', 'npm_cli', 'git_cli'], // Example tools
    },
    mcpConfig: {
      name: 'ExpoProjectMCP',
      description: 'Expo 项目创建的 MCP 配置',
      steps: ['init', 'install_dependencies', 'run_tests'], // Example steps
    },
  },
  // Placeholder for future templates
  // {
  //   id: 'nextjs-template',
  //   name: 'Next.js 全栈应用',
  //   description: '一个基于 Next.js 15 和 TypeScript 的全栈应用模板。',
  //   repoUrl: 'https://gitee.com/opencode-templates/nextjs-template.git',
  //   variables: [
  //     {
  //       id: 'PROJECT_NAME',
  //       name: '项目名称 (kebab-case)',
  //       defaultValue: 'my-nextjs-app',
  //       description: '项目的英文名称，例如：my-nextjs-app',
  //       required: true,
  //       type: 'string',
  //     },
  //   ],
  // },
];
