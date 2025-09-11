interface CronJob {
  name: string;
  interval: number; // in milliseconds
  lastRun: number;
  handler: (env?: any) => Promise<void>;
}

class CronManager {
  private jobs: CronJob[] = [];

  /**
   * Registers a new cron job
   * @param name Job name
   * @param interval Interval in milliseconds
   * @param handler Function to execute
   */
  registerCronJob(name: string, interval: number, handler: (env?: any) => Promise<void>): void {
    this.jobs.push({
      name,
      interval,
      lastRun: 0,
      handler,
    });
    console.log(`Registered cron job: ${name} (interval: ${interval}ms)`);
  }

  /**
   * Executes all due cron jobs
   * @param env Environment variables
   */
  async executeDueJobs(env?: any): Promise<void> {
    const now = Date.now();
    
    for (const job of this.jobs) {
      if (now - job.lastRun >= job.interval) {
        console.log(`Executing cron job: ${job.name}`);
        try {
          await job.handler(env);
          job.lastRun = now;
          console.log(`Completed cron job: ${job.name}`);
        } catch (error) {
          console.error(`Error in cron job ${job.name}:`, error);
        }
      }
    }
  }

  /**
   * Lists all registered jobs
   */
  listJobs(): CronJob[] {
    return this.jobs;
  }
}

export const cronManager = new CronManager();
