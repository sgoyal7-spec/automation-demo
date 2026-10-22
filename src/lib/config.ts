export const config = {
  /** White-label name of the Slack assistant. Shown in prompts and replies. */
  assistantName: process.env.ASSISTANT_NAME ?? 'Samantha',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? '',
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
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

/** Bot token + channel gives full features (buttons, thread updates). A webhook alone gives one-way alerts. */
export const slackMode = (): 'bot' | 'webhook' | 'off' =>
  config.slack.botToken && config.slack.channelId ? 'bot' : config.slack.webhookUrl ? 'webhook' : 'off'
export const slackEnabled = () => slackMode() !== 'off'
