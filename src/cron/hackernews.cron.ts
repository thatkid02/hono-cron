import { AIService } from "../services/ai.service";
import { getISTTime, parseTweet, postTweet } from "../services/twitter.service";

// In-memory cache of posted story IDs with a TTL
let postedStories: number[] = [];
let lastResetTimestamp: number = Date.now();

/**
 * Checks if the in-memory cache needs to be reset (1 day TTL)
 * and resets it if necessary
 */
function checkAndResetCache(): void {
    const now = Date.now();
    // Reset the cache if it's been more than a day (86400000 ms)
    if (now - lastResetTimestamp > 86400000) {
        console.log("Resetting posted stories cache (24-hour TTL expired)");
        postedStories = []; // Create a new empty array
        lastResetTimestamp = now;
    }
}

/**
 * Marks a story as posted by adding it to the in-memory cache
 * @param storyId The ID of the posted story
 */
function markStoryAsPosted(storyId: number): void {
    if (!postedStories.includes(storyId)) {
        postedStories.push(storyId);
        console.log(`Story ${storyId} marked as posted. Cache now has ${postedStories.length} stories.`);
    }
}

/**
 * Interface for a HackerNews story
 */
interface HNStory {
    id: number;
    title: string;
    url: string;
    by: string;
    score: number;
    time: number;
    descendants: number;
    kids: number[];
    type: string;
}

/**
 * Interface for a HackerNews comment
 */
interface HNComment {
    id: number;
    text: string;
    by: string;
    time: number;
    parent: number;
    kids?: number[];
    type: string;
}

/**
 * Fetches the top stories from HackerNews
 * @returns Array of top story IDs
 */
async function fetchTopStories(): Promise<number[]> {
    try {
        const response = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
        if (!response.ok) {
            throw new Error(`Failed to fetch top stories: ${response.status}`);
        }
        return await response.json() as number[];
    } catch (error) {
        console.error("Error fetching top stories:", error);
        return [];
    }
}

/**
 * Fetches a HackerNews item (story or comment) by ID
 * @param id Item ID
 * @returns The item data
 */
async function fetchItem<T>(id: number): Promise<T | null> {
    try {
        const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch item ${id}: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching item ${id}:`, error);
        return null;
    }
}

/**
 * Fetches a top HackerNews story
 * @returns A top story with its details
 */
async function fetchTopStory(): Promise<HNStory | null> {
    try {
        // First, check if we need to reset the cache
        checkAndResetCache();

        const topStoryIds = await fetchTopStories();
        if (!topStoryIds.length) {
            throw new Error("No top stories found");
        }

        // Get the first story that has a URL and hasn't been posted yet
        for (let i = 0; i < Math.min(30, topStoryIds.length); i++) {
            const storyId = topStoryIds[i];

            // Skip if this story has already been posted today
            if (postedStories.includes(storyId)) {
                console.log(`Skipping story ${storyId} as it was already posted today`);
                continue;
            }

            const story = await fetchItem<HNStory>(storyId);
            if (story && story.url && story.kids && story.kids.length > 0) {
                // Mark this story as posted
                markStoryAsPosted(storyId);
                return story;
            }
        }

        // If we've gone through all stories and they're all posted or invalid,
        // reset the cache and try again
        if (postedStories.length > 0) {
            console.log("All top stories have been posted today, resetting tracker and picking the first valid one");
            postedStories = [];

            // Try again with the first valid story
            for (let i = 0; i < Math.min(10, topStoryIds.length); i++) {
                const storyId = topStoryIds[i];
                const story = await fetchItem<HNStory>(storyId);
                if (story && story.url && story.kids && story.kids.length > 0) {
                    markStoryAsPosted(storyId);
                    return story;
                }
            }
        }

        return null;
    } catch (error) {
        console.error("Error fetching top story:", error);
        return null;
    }
}

/**
 * Fetches top comments for a story
 * @param storyId The story ID
 * @param count Number of comments to fetch
 * @returns Array of comments
 */
async function fetchTopComments(storyId: number, count: number = 3): Promise<HNComment[]> {
    try {
        const story = await fetchItem<HNStory>(storyId);
        if (!story || !story.kids || !story.kids.length) {
            return [];
        }

        const comments: HNComment[] = [];
        for (let i = 0; i < Math.min(count, story.kids.length); i++) {
            const comment = await fetchItem<HNComment>(story.kids[i]);
            if (comment && comment.text) {
                comments.push(comment);
            }
        }

        return comments;
    } catch (error) {
        console.error(`Error fetching comments for story ${storyId}:`, error);
        return [];
    }
}

/**
 * Cleans HTML entities and tags from text
 * @param text The text to clean
 * @returns Cleaned text
 */
function cleanHtmlText(text: string): string {
    return text
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<[^>]*>/g, '');
}

/**
 * Creates a prompt for AI to generate a tweet about a HackerNews story and comment
 * @param story The HackerNews story
 * @param comment The top comment
 * @returns AI prompt for tweet generation
 */
function createTweetPrompt(story: HNStory, comment: HNComment): string {
    const cleanComment = cleanHtmlText(comment.text);
    return `Create a concise and insightful tweet about this Hacker News discussion:

Article: "${story.title}"
Top comment: "${cleanComment.substring(0, 200)}${cleanComment.length > 200 ? '...' : ''}"

The tweet should:
1. Be thoughtful and interesting
2. Include the article URL: ${story.url}
3. Add hashtags like #HackerNews and #Tech
4. Use emojis where appropriate
5. Be under 280 characters total

FORMAT: Respond ONLY with a JSON object with this exact structure:
{"tweet": "Your tweet text here"}
No additional text or formatting, just the raw JSON object.`;
}

/**
 * Generates content for a tweet based on a HackerNews story and comment
 * @returns Generated tweet content
 */
async function generateTweetContent(env?: any): Promise<string | null> {
    try {
        // Fetch a top story
        const story = await fetchTopStory();
        if (!story) {
            console.error('Failed to fetch a top story');
            return null;
        }

        console.log(`Fetched top story: "${story.title}" (${story.url})`);

        // Fetch top comments
        const comments = await fetchTopComments(story.id);
        if (!comments || comments.length === 0) {
            console.error(`No comments found for story ${story.id}`);
            return null;
        }

        console.log(`Fetched ${comments.length} comments for story ${story.id}`);

        // Create prompt for AI using the top comment
        const prompt = createTweetPrompt(story, comments[0]);

        // Get AI response
        const res = await AIService.getAIResponse(prompt, env);
        console.log("Raw AI response:", res);

        // Parse the tweet
        const tweet = parseTweet(res);
        return tweet || null;
    } catch (error) {
        console.error('Error generating tweet content:', error);
        return null;
    }
}

/**
 * Main function to generate and post a HackerNews tweet
 */
export async function generateHNAndPostTweet(env?: any): Promise<void> {
    try {
        // Generate tweet content
        const tweetContent = await generateTweetContent(env);
        if (!tweetContent) {
            console.error('Failed to generate tweet content');
            return;
        }

        // Post the tweet
        const success = await postTweet(tweetContent, "HN cron job: ", env);
        if (success) {
            console.log('Tweet posted successfully');
        } else {
            console.error('Failed to post tweet');
        }

        console.log(`Hacker News cron job completed successfully at ${getISTTime()} IST`);
    } catch (error) {
        console.error(`Error in Hacker News cron job:`, error);
    }
}
