import { create } from 'zustand'
import { createLogger } from '@/lib/logs/console-logger'
import type { BlockOutput } from '@/blocks/types'
import type { StreamingExecution } from '@/executor/types'

const logger = createLogger('PromptQueue')

export interface QueuedPrompt {
  id: string
  providerRequest: any
  block: any
  responseFormat: any
  context: any
  resolve: (result: BlockOutput | StreamingExecution) => void
  reject: (error: any) => void
}

interface PromptQueueState {
  prompts: QueuedPrompt[]
  isProcessing: boolean
  addToQueue: (prompt: Omit<QueuedPrompt, 'id'>) => string
  processNextPrompt: () => void
  completePrompt: (promptId: string) => void
}

export const usePromptQueueStore = create<PromptQueueState>((set, get) => ({
  prompts: [],
  isProcessing: false,

  addToQueue: (prompt) => {
    const id = crypto.randomUUID()
    const newPrompt = { ...prompt, id }
    set((state) => ({
      prompts: [...state.prompts, newPrompt],
    }))
    logger.info('Prompt added to queue', { promptId: id, queueSize: get().prompts.length })
    get().processNextPrompt()
    return id
  },

  processNextPrompt: () => {
    const { prompts, isProcessing } = get()
    if (isProcessing || prompts.length === 0) {
      return
    }

    set({ isProcessing: true })
    const prompt = prompts[0]
    logger.info('Processing prompt', { promptId: prompt.id, queueSize: prompts.length })

    // The actual execution will be handled by a hook that calls this store.
    // This function's role is primarily to manage the queue state.
  },

  completePrompt: (promptId) => {
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== promptId),
      isProcessing: false,
    }))
    logger.info('Prompt completed', { promptId, queueSize: get().prompts.length })
    get().processNextPrompt()
  },
}))
