import { useEffect } from 'react'
import { usePromptQueueStore } from '@/stores/prompt-queue/store'
import { AgentBlockHandler } from '@/executor/handlers/agent/agent-handler'

export function usePromptQueue() {
  const { prompts, isProcessing, processNextPrompt, completePrompt } = usePromptQueueStore()

  useEffect(() => {
    if (!isProcessing && prompts.length > 0) {
      const prompt = prompts[0]
      const handler = new AgentBlockHandler()

      const execute = async () => {
        try {
          // @ts-ignore
          const result = await handler.executeProviderRequest(
            prompt.providerRequest,
            prompt.block,
            prompt.responseFormat,
            prompt.context
          )
          prompt.resolve(result)
        } catch (error) {
          prompt.reject(error)
        } finally {
          completePrompt(prompt.id)
        }
      }

      processNextPrompt()
      execute()
    }
  }, [prompts, isProcessing, processNextPrompt, completePrompt])
}
