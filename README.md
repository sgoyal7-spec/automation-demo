# Outreach Automation Demo

A small, standalone automation that shows how a LinkedIn reply from a prospect flows through AI qualification, into a CRM, and out to the account manager's Slack channel, with scheduled follow-up escalation and a daily digest.

Built as a technical demo. All prospect data is invented. Nothing here connects to any production system.

## What it demonstrates

| # | Workflow | Trigger | What happens |
|---|---|---|---|
| 1 | Reply qualification | Prospect reply arrives (`POST /api/replies`) | Claude on Amazon Bedrock classifies it (interested / meeting / objection / not now), scores interest 1-5, writes a suggested reply and next action. CRM lead + follow-up task created. |
| 2 | Slack alert | Same event | Block Kit message to the AM channel with the analysis and action buttons. |
| 3 | Meeting booked | "Book meeting" button in Slack | Lead marked BOOKED, discovery-call task created, meeting prep brief posted in the thread. |
| 4 | Overdue escalation | Scheduler (every 60s) | Leads awaiting a human reply past the SLA get an escalation message. |
| 5 | Daily digest | Scheduler / on demand | Replies, positive responses, bookings and overdue counts, broken down by account manager. |
| 6 | Slack assistant ("@Samantha") | `@Samantha <question>` in the channel | A tool-using Claude agent answers from the CRM: who replied, meetings today, overdue follow-ups, and can book meetings for prospects who agreed to meet. Replies in the thread. Name is configurable (`ASSISTANT_NAME`). |

## Code map

```
src/lib/ai.ts          Bedrock classification + keyword fallback
src/lib/slack.ts       Block Kit builders, chat.postMessage, signature verification
src/lib/workflows.ts   The five workflows (the "automation engine")
src/lib/agent.ts       Slack assistant: Bedrock tool-use loop over five CRM tools
src/instrumentation.ts In-process scheduler
src/app/api/*          HTTP entry points: replies, Slack interactions, Slack events (assistant), jobs, reset
src/app/page.tsx       Simulated LinkedIn inbox (demo operator UI)
src/app/crm/page.tsx   CRM table with history and open tasks
prisma/schema.prisma   Prospect, Lead, Interaction, Task
deploy/                Caddyfile, EC2 user-data, IAM policy
```

## Run locally

```bash
cp .env.example .env            # set AI_PROVIDER="mock" if you have no AWS creds
npm install
npm run db:push && npm run db:seed
npm run dev                     # http://localhost:3000
```

Without Slack credentials the app logs the messages it would have sent instead of failing.

## Slack setup

**Fastest (any workspace, about 3 minutes):**

1. https://api.slack.com/apps → **Create New App** → **From a manifest** → pick the workspace → paste `deploy/slack-manifest.yaml` (YAML tab) → Create. The server must already be reachable at the URLs in the manifest because Slack verifies them.
2. **Install to Workspace** → Allow. Copy the **Bot User OAuth Token** (`SLACK_BOT_TOKEN`).
3. **Basic Information** → App Credentials → **Signing Secret** (`SLACK_SIGNING_SECRET`).
4. Create a channel, open its details, copy the **Channel ID** from the bottom of the About tab (`SLACK_CHANNEL_ID`), and `/invite @Samantha`.
5. Put the three values in `.env` on the host and run `docker compose up -d`.

**Alert-only fallback:** an Incoming Webhook for the channel in `SLACK_WEBHOOK_URL`. One-way, no buttons, no assistant.

## Deploy on one EC2 host

No domain is required. The host is reached through [sslip.io](https://sslip.io), a public DNS service that resolves `A-B-C-D.sslip.io` to the IP `A.B.C.D`, and Caddy obtains a real Let's Encrypt certificate for that hostname.

1. Launch a `t4g.small` (Amazon Linux 2023, arm64) with `deploy/ec2-userdata.sh` as user data, an Elastic IP, and a security group allowing 80 and 443 from anywhere and 22 from your IP.
2. Attach an instance role with `deploy/iam-bedrock-policy.json`. That is the only AWS permission the app needs.
3. Create `/opt/automation-demo/.env` on the host from `.env.example`, with `APP_URL=https://<ip-with-dashes>.sslip.io` and `DOMAIN=<ip-with-dashes>.sslip.io`.
4. From your machine:
   ```bash
   deploy/push.sh <elastic-ip>        # copies the source and runs docker compose up -d --build
   ```
5. To change Slack settings later, edit `.env` on the host and run `docker compose up -d` in `/opt/automation-demo`.

## Demo script

1. Open the inbox. Show the empty CRM.
2. Receive an "Interested" reply. Slack lights up, CRM shows the lead and a task.
3. Click "Book meeting" in Slack. Prep brief appears, CRM flips to BOOKED.
4. Receive an "Objection: price" reply. Show the different classification and suggested handling.
5. Wait for the SLA (3 min) or click "Run escalation check". Escalation fires on the untouched lead.
6. Click "Send daily digest".
7. Walk through `src/lib/workflows.ts`.
