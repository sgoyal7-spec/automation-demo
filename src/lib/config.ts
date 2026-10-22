export const config = {
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? '',
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
    channelId: process.env.SLACK_CHANNEL_ID ?? '',
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'bedrock') as 'bedrock' | 'mock',
    region: process.env.AWS_REGION ?? 'us-west-2',
    modelId: process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-5-5',
  },
  followUpSlaMinutes: Number(process.env.FOLLOW_UP_SLA_MINUTES ?? 3),
  schedulerIntervalSeconds: Number(process.env.SCHEDULER_INTERVAL_SECONDS ?? 60),
}

export const slackEnabled = () => Boolean(config.slack.botToken && config.slack.channelId)
