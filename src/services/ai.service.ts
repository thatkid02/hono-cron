/**
 * Service for handling AI chat interactions
 */
export class AIService {
  /**
   * Get AI response using OpenAI API
   * @param requestMessage The message to send to AI
   * @param env Environment variables
   * @returns AI response
   */
  static async getAIResponse(requestMessage: string, env?: any): Promise<string> {
    try {
      const apiKey = env?.OPENAI_API_KEY || 'your-api-key-here';
      const model = env?.OPENAI_MODEL || 'deepseek-chat';
      
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI assistant. Answer questions concisely and accurately. Add emojis to your answers to make them more engaging.',
            },
            {
              role: 'user',
              content: requestMessage,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.choices[0]?.message?.content || 'Something went wrong';
    } catch (error) {
      console.error('Error getting AI response:', error);
      return 'Something went wrong';
    }
  }
}
