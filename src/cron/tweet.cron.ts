import { AIService } from "../services/ai.service";
import { getISTTime, parseTweet, postTweet } from "../services/twitter.service";

/**
 * Generates random words for tweet creation
 * @returns Two random words as an array
 */
async function generateRandomWords(): Promise<string[]> {
    const words = await (await fetch("https://random-word-api.vercel.app/api?words=2")).json() as string[];
    console.log(`Generated words for tweet: ${words[0]} and ${words[1]}`);
    return words;
}

/**
 * Creates a prompt for AI to generate a tweet using random words
 * @param first First random word
 * @param second Second random word
 * @returns AI prompt for tweet generation
 */
function createTweetPrompt(first: string, second: string): string {
    return `Create really humorous and creative tweet using the words "${first}" and "${second}", also dont use words just or do". 
Include hashtags like #AI and use emojis. Tag users @gork, @grok and @AskPerplexity make sure text is less than 280 characters.
FORMAT: Respond ONLY with a JSON object with this exact structure:
{"tweet": "Your tweet text here"}
No additional text or formatting, just the raw JSON object. Do not enclose the JSON like \`\`\`json {"tweet": "text" } \`\`\`.`;
}

/**
 * Main function to generate and post a tweet
 */
export async function generateAndPostTweet(env?: any, optionalText: string = ''): Promise<void> {
    try {
        // Generate random words
        const [first, second] = await generateRandomWords();

        // Create tweet using AI
        const prompt = createTweetPrompt(first, second);
        const res = await AIService.getAIResponse(optionalText || prompt, env);
        console.log("Raw AI response:", res);

        // Parse the tweet
        const originalTweet = parseTweet(res);
        if (!originalTweet) {
            return;
        }

        // Post tweet to Twitter and Telegram
        await postTweet(originalTweet, "Random word tweet: ", env);

        console.log(`Random word cron job completed successfully at ${getISTTime()} IST`);
    } catch (error) {
        console.error(`Error in random word cron job:`, error);
    }
}
