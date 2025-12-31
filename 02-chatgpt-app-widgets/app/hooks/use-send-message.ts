import { useCallback } from "react";

/**
 * Hook to send follow-up messages to the ChatGPT conversation.
 * 
 * @returns A function that sends a message prompt to ChatGPT
 * 
 * @example
 * ```tsx
 * const sendMessage = useSendMessage();
 * 
 * const handleAction = async () => {
 *   await sendMessage("Tell me more about this topic");
 * };
 * ```
 */
export function useSendMessage() {
  const sendMessage = useCallback((prompt: string) => {
    if (typeof window !== "undefined" && window?.openai?.sendFollowUpMessage) {
      console.log(`SendFollowUpMessage: ${prompt}`);
      return window.openai.sendFollowUpMessage({ prompt });
    }
    return Promise.resolve();
  }, []);

  return sendMessage;
}