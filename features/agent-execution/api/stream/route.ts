import { NextRequest, NextResponse } from 'next/server'
import {
  StreamMessage,
  UserMessageEntry,
  AssistantMessageEntry,
  ToolUseEntry,
  ErrorMessageEntry,
  TypingIndicatorEntry,
  ExecutionStartedEntry,
  ExecutionCompletedEntry,
} from '../../types/stream'

// Demo data for testing
async function* generateDemoEntries(sessionId: string): AsyncGenerator<StreamMessage> {
  const startTime = Date.now()

  // Execution started
  yield {
    id: '1',
    type: 'execution_started',
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    agent_name: 'Sisyphus',
  } as ExecutionStartedEntry

  // User message
  yield {
    id: '2',
    type: 'user_message',
    timestamp: new Date().toISOString(),
    content: '请修复登录页面的表单间距问题，特别是在移动端。目前输入框靠得太近了。',
  } as UserMessageEntry

  // Assistant typing indicator
  yield {
    id: '3',
    type: 'typing_indicator',
    timestamp: new Date().toISOString(),
    agent_name: 'Sisyphus',
  } as TypingIndicatorEntry

  // Assistant message (after delay)
  yield {
    id: '4',
    type: 'assistant_message',
    timestamp: new Date().toISOString(),
    content: `收到，我已经定位到了问题。在 **login.css** 中，表单项的 \`margin-bottom\` 设置得太小了。我建议修改如下：

\`\`\`css
.login-form-item {
  margin-bottom: 24px;
}
\`\`\`

这样可以确保输入框之间有足够的间距。`,
  } as AssistantMessageEntry

  // Tool use
  yield {
    id: '5',
    type: 'tool_use',
    timestamp: new Date().toISOString(),
    tool_name: 'edit_file',
    tool_call_id: 'call_1',
    status: 'started',
    parameters: {
      file_path: 'src/styles/login.css',
      search_pattern: '.login-form-item {',
    },
  } as ToolUseEntry

  // Tool result
  yield {
    id: '6',
    type: 'tool_use',
    timestamp: new Date().toISOString(),
    tool_name: 'edit_file',
    tool_call_id: 'call_1',
    status: 'completed',
    output: 'Successfully edited src/styles/login.css',
  } as ToolUseEntry

  // Another assistant message
  yield {
    id: '7',
    type: 'assistant_message',
    timestamp: new Date().toISOString(),
    content: `我已经修复了登录页面的间距问题。现在表单元素之间的间距更加合理了。

还有其他需要调整的地方吗？`,
  } as AssistantMessageEntry

  // Execution completed
  yield {
    id: '8',
    type: 'execution_completed',
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    duration_ms: Date.now() - startTime,
    summary: '成功修复登录表单间距问题',
  } as ExecutionCompletedEntry
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return new NextResponse('Missing session_id parameter', { status: 400 })
  }

  const encoder = new TextEncoder()
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const generator = generateDemoEntries(sessionId)

        for await (const entry of generator) {
          const sseData = `data: ${JSON.stringify(entry)}\n\n`
          controller.enqueue(encoder.encode(sseData))

          // Add delays between messages for realistic streaming
          await new Promise((resolve) => setTimeout(resolve, 500))
        }

        controller.close()
      } catch (error) {
        const errorEntry: ErrorMessageEntry = {
          id: 'error',
          type: 'error_message',
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: false,
        }
        const sseData = `data: ${JSON.stringify(errorEntry)}\n\n`
        controller.enqueue(encoder.encode(sseData))
        controller.close()
      }
    },
    cancel() {
      // 仅 slash 调试时保留其他日志
      // console.log('Stream cancelled for session:', sessionId)
    },
  })

  return new NextResponse(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

// Handle follow-up messages (POST)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { session_id, message, attempt_id } = body

    if (!session_id || !message) {
      return NextResponse.json(
        { error: 'Missing session_id or message' },
        { status: 400 }
      )
    }

    // TODO: Forward the follow-up message to the agent execution engine
    // This would typically:
    // 1. Add the user message to the conversation history
    // 2. Trigger the agent to continue execution
    // 3. Return success and let the SSE stream continue with new messages

    return NextResponse.json({
      success: true,
      message_id: `msg_${Date.now()}`,
      session_id,
      attempt_id,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
