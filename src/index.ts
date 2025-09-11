import { Hono } from 'hono';
import { generateAndPostTweet } from './cron/tweet.cron';
import { generateHNAndPostTweet } from './cron/hackernews.cron';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Hono Cron Service is running! 🚀');
});

app.get('/jobs', (c) => {
  const jobs = [
    {
      name: "Random Word Tweets",
      cron: "0 */2 * * *",
      description: "Generates tweets using random words every 2 hours"
    },
    {
      name: "HackerNews Tweets", 
      cron: "0 */5 * * *",
      description: "Generates tweets about HN stories every 5 hours"
    }
  ];
  return c.json(jobs);
});

app.post('/trigger/:jobType', async (c) => {
  const jobType = c.req.param('jobType');
  const env = c.env as Env;
  const prompt = c.req.query('q') || '';
  try {
    if (jobType === 'random-tweet') {
      console.log('Manually triggering random word tweet generation');
      await generateAndPostTweet(env, prompt);
      return c.json({ success: true, message: 'Random word tweet job triggered successfully' });
    } else if (jobType === 'hn-tweet') {
      console.log('Manually triggering HackerNews tweet generation');
      await generateHNAndPostTweet(env);
      return c.json({ success: true, message: 'HackerNews tweet job triggered successfully' });
    } else {
      return c.json({ success: false, message: 'Invalid job type. Use "random-tweet" or "hn-tweet"' }, 400);
    }
  } catch (error) {
    console.error('Error triggering job:', error);
    return c.json({ success: false, message: 'Error triggering job', error: String(error) }, 500);
  }
});

interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
  TWITTER_CONSUMER_KEY?: string;
  TWITTER_CONSUMER_SECRET?: string;
  TWITTER_ACCESS_TOKEN?: string;
  TWITTER_ACCESS_SECRET?: string;
}

export default {
  async scheduled(
    controller: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log('Scheduled cron job executed at:', new Date().toISOString());
    console.log('Cron pattern:', controller.cron);
    
    if (controller.cron === "0 */2 * * *") {
      await generateAndPostTweet(env);
    } else if (controller.cron === "0 */5 * * *") {
      await generateHNAndPostTweet(env);
    } else {
      console.log('Running fallback: executing both cron jobs');
    }
    
    console.log('Cron job processing completed');
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
