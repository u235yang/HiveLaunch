// F3: CLI Parser - CLI 参数解析

export interface CLIOptions {
  prompt: string
  agent?: string
  workspace?: string
  verbose?: boolean
}

export function parseCLIArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    prompt: '',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--agent=')) {
      options.agent = arg.split('=')[1]
    } else if (arg.startsWith('--workspace=')) {
      options.workspace = arg.split('=')[1]
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
    } else if (!arg.startsWith('-')) {
      options.prompt = arg
    }
  }

  return options
}

export function buildCLICommand(cli: string, options: CLIOptions): string {
  const parts = [cli]
  
  if (options.agent) {
    parts.push(`--agent=${options.agent}`)
  }
  if (options.workspace) {
    parts.push(`--workspace=${options.workspace}`)
  }
  if (options.verbose) {
    parts.push('--verbose')
  }
  if (options.prompt) {
    parts.push(JSON.stringify(options.prompt))
  }

  return parts.join(' ')
}
