import type { Message } from "../types/domain";

export interface AgentProvider {
  sendMessage(conversationId: string, content: string): Promise<Message>;
  streamResponse(
    conversationId: string,
    content: string
  ): AsyncIterable<string>;
}
