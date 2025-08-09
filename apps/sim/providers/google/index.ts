import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  FunctionCallingMode,
} from '@google/generative-ai'
import { createLogger } from '@/lib/logs/console-logger'
import type { StreamingExecution } from '@/executor/types'
import { executeTool } from '@/tools'
import { getProviderDefaultModel, getProviderModels } from '../models'
import type { ProviderConfig, ProviderRequest, ProviderResponse, TimeSegment } from '../types'
import { prepareToolExecution, prepareToolsWithUsageControl, trackForcedToolUsage } from '../utils'

const logger = createLogger('GoogleProvider')

export const googleProvider: ProviderConfig = {
  id: 'google',
  name: 'Google',
  description: "Google's Gemini models",
  version: '1.0.0',
  models: getProviderModels('google'),
  defaultModel: getProviderDefaultModel('google'),

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | StreamingExecution> => {
    if (!request.apiKey) {
      throw new Error('API key is required for Google Gemini')
    }

    const genAI = new GoogleGenerativeAI(request.apiKey)
    const requestedModel = request.model || 'gemini-1.5-pro-latest'

    const model = genAI.getGenerativeModel({
      model: requestedModel,
      ...convertToGeminiFormat(request),
    })

    const providerStartTime = Date.now()
    const providerStartTimeISO = new Date(providerStartTime).toISOString()

    if (request.stream) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await model.generateContentStream(request.context || '')
            for await (const chunk of result.stream) {
              controller.enqueue(new TextEncoder().encode(chunk.text()))
            }
            controller.close()
          } catch (error) {
            logger.error('Error in Google Gemini streaming request', { error })
            controller.error(error)
          }
        },
      })

      return {
        stream,
        execution: {
          success: true,
          output: {
            content: '',
            model: request.model,
            tokens: { prompt: 0, completion: 0, total: 0 },
            providerTiming: {
              startTime: providerStartTimeISO,
              endTime: new Date().toISOString(),
              duration: Date.now() - providerStartTime,
              modelTime: 0,
              toolsTime: 0,
              firstResponseTime: 0,
              iterations: 1,
              timeSegments: [],
            },
          },
          logs: [],
          metadata: {
            startTime: providerStartTimeISO,
            endTime: new Date().toISOString(),
            duration: Date.now() - providerStartTime,
          },
          isStreaming: true,
        },
      }
    }

    const chat = model.startChat({
      history: request.messages?.map((message) => ({
        role: message.role === 'assistant' ? 'model' : message.role,
        parts: [{ text: message.content || '' }],
      })),
    })

    const result = await chat.sendMessage(request.context || '')
    const response = result.response
    const content = response.text()
    const tokens = {
      prompt: 0,
      completion: 0,
      total: 0,
    }

    return {
      content,
      model: request.model,
      tokens,
      toolCalls: undefined,
      toolResults: undefined,
      timing: {
        startTime: providerStartTimeISO,
        endTime: new Date().toISOString(),
        duration: Date.now() - providerStartTime,
        modelTime: 0,
        toolsTime: 0,
        firstResponseTime: 0,
        iterations: 1,
        timeSegments: [],
      },
    }
  },
}

function convertToGeminiFormat(request: ProviderRequest) {
  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ]

  const generationConfig = {
    temperature: request.temperature,
    maxOutputTokens: request.maxTokens,
  }

  const tools = request.tools?.map((tool) => ({
    functionDeclarations: [
      {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters,
      },
    ],
  }))

  const toolConfig = {
    functionCallingConfig: {
      mode: FunctionCallingMode.AUTO,
    },
  }

  return {
    safetySettings,
    generationConfig,
    tools,
    toolConfig,
  }
}
