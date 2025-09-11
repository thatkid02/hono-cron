/**
 * Creates HMAC-SHA1 signature for OAuth
 * @param signingKey The signing key
 * @param baseString The signature base string
 * @returns Base64 encoded signature
 */
async function createOAuthSignature(signingKey: string, baseString: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(baseString);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signature);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < signatureArray.byteLength; i++) {
        binary += String.fromCharCode(signatureArray[i]);
    }
    return btoa(binary);
}

/**
 * Generates a random nonce for OAuth
 * @returns Random nonce string
 */
function generateNonce(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

/**
 * Escapes special characters in a tweet for Telegram's MarkdownV2 format
 * @param tweet Original tweet text
 * @returns Escaped tweet for Telegram
 */
export function escapeTelegramMarkdown(tweet: string): string {
    const specialCharacters = [
        "_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!", "?", "@"
    ];

    let teleTweet = tweet;
    specialCharacters.forEach((char) => {
        const regex = new RegExp(`\\${char}`, "g");
        teleTweet = teleTweet.replace(regex, `\\${char}`);
    });

    console.log("Escaped tweet for Telegram:", teleTweet);
    return teleTweet;
}

/**
 * Sends a message to Telegram
 * @param tweet Text to send to Telegram
 * @param prefix Optional prefix for the tweet message
 * @param env Environment variables
 * @returns Promise that resolves to boolean indicating success
 */
export async function sendTelegramMessage(tweet: string, prefix: string = "cron job: ", env?: any): Promise<boolean> {
    try {
        const botToken = env?.TG_BOT_TOKEN;
        const chatId = env?.TG_CHAT_ID;
        
        if (!botToken || !chatId) {
            console.error("Telegram bot token or chat ID missing");
            return false;
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const body = JSON.stringify({
            chat_id: chatId,
            text: prefix + tweet,
            parse_mode: "MarkdownV2",
            disable_web_page_preview: true,
            disable_notification: true,
        });

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body,
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Telegram API error:", errorData);
            return false;
        } else {
            console.log("Successfully sent message to Telegram");
            return true;
        }
    } catch (error) {
        console.error("Error sending to Telegram:", error);
        return false;
    }
}

/**
 * Gets current time in IST format
 * @returns IST time as string
 */
export function getISTTime(): string {
    const date = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(date.getTime() + istOffset);
    return istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Posts a tweet to Twitter using OAuth 1.0a
 * @param tweetText Text to tweet
 * @param env Environment variables
 * @returns Promise that resolves to boolean indicating success
 */
export async function postToTwitter(tweetText: string, env?: any): Promise<boolean> {
    try {
        const url = 'https://api.twitter.com/2/tweets';

        const consumerKey = env?.TWITTER_CONSUMER_KEY;
        const consumerSecret = env?.TWITTER_CONSUMER_SECRET;
        const accessToken = env?.TWITTER_ACCESS_TOKEN;
        const accessTokenSecret = env?.TWITTER_ACCESS_SECRET;

        if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
            console.error('Twitter OAuth credentials missing in environment variables');
            return false;
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = generateNonce();

        type OAuthParams = {
            oauth_consumer_key: string;
            oauth_nonce: string;
            oauth_signature_method: string;
            oauth_timestamp: string;
            oauth_token: string;
            oauth_version: string;
            oauth_signature?: string;
        };

        const requestBody = { text: tweetText };
        const oauthParams: OAuthParams = {
            oauth_consumer_key: consumerKey,
            oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: timestamp,
            oauth_token: accessToken,
            oauth_version: '1.0'
        };

        // Create signature base string
        const signatureBaseString = [
            'POST',
            encodeURIComponent(url),
            encodeURIComponent(
                Object.keys(oauthParams)
                    .sort()
                    .map(key => {
                        const value = oauthParams[key as keyof OAuthParams];
                        return `${key}=${encodeURIComponent(String(value))}`;
                    })
                    .join('&')
            )
        ].join('&');

        // Create signing key
        const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
        
        // Generate signature
        const signature = await createOAuthSignature(signingKey, signatureBaseString);
        oauthParams.oauth_signature = signature;

        // Create authorization header
        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .map(key => {
                const value = oauthParams[key as keyof OAuthParams];
                return `${encodeURIComponent(key)}="${encodeURIComponent(String(value))}"`;
            })
            .join(', ');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Twitter API error:', errorData);
            return false;
        }

        const data = await response.json();
        console.log('Tweet posted successfully:', data);
        return true;
    } catch (error) {
        console.error('Error posting to Twitter:', error);
        return false;
    }
}

/**
 * Parses the AI response to extract the tweet text
 * @param res AI response
 * @returns Extracted tweet text
 */
export function parseTweet(res: string): string | undefined {
    try {
        // Try to parse as JSON first
        const parsedRes = JSON.parse(res);
        const tweet = parsedRes.tweet || parsedRes.toString();
        console.log("Parsed tweet from JSON:", tweet);
        return tweet;
    } catch (error) {
        try {
            const tweet = (JSON.parse(res.replace(/```json|```/g, "").trim())).tweet;
            console.log("Parsed tweet from raw response:", tweet);
            return tweet;
        } catch (error) {
            console.error("Error parsing AI response:", error);
            return undefined;
        }
    }
}

/**
 * Posts a tweet to both Twitter and Telegram
 * @param content The tweet content
 * @param telegramPrefix Optional prefix for Telegram messages
 * @param env Environment variables
 * @returns Whether posting was successful
 */
export async function postTweet(content: string, telegramPrefix: string = "cron job: ", env?: any): Promise<boolean> {
    try {
        let success = false;

        // Post to Twitter if credentials exist
        if (env?.TWITTER_CONSUMER_KEY) {
            const twitterResult = await postToTwitter(content, env);
            if (twitterResult) {
                console.log(`Successfully posted to Twitter: ${content}`);
                success = true;
            } else {
                console.error(`Failed to post to Twitter`);
            }
        }

        // Escape and send to Telegram
        const teleTweet = escapeTelegramMarkdown(content);
        const telegramResult = await sendTelegramMessage(teleTweet, telegramPrefix, env);
        if (telegramResult) {
            success = true;
        }

        return success;
    } catch (error) {
        console.error('Error posting tweet:', error);
        return false;
    }
}
