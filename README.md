# GTM Engine Webhook Receiver

Receives webhooks from PlusVibe, processes replies, and pushes interested leads to Close CRM.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook/gtm-engine-replies` | POST | Main webhook for all reply events |
| `/webhook/plusvibe-interested-lead` | POST | Legacy webhook (backwards compat) |
| `/health` | GET | Health check |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOSE_API_KEY` | Yes | Close CRM API key |
| `TELEGRAM_BOT_TOKEN` | No | For notifications |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID |
| `PORT` | No | Server port (default: 3000) |

## Deployment

### Railway

1. Push to GitHub
2. Create new Railway project
3. Add environment variables
4. Deploy

### Local

```bash
npm install
cp .env.example .env
# Edit .env with your keys
npm start
```

## Webhook Flow

```
PlusVibe Reply
     │
     ▼
┌─────────────────┐
│ Webhook Receiver │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
POSITIVE   NEGATIVE
    │         │
    ▼         ▼
Close CRM   Log for
  Lead      Analysis
    │         │
    ▼         ▼
Telegram   Telegram
  Alert      Alert
```

## Close CRM Status Mapping

| Sentiment/Event | Close Status |
|-----------------|--------------|
| POSITIVE / INTERESTED | Interested |
| NEUTRAL | Long-Term Nurture |
| NEGATIVE / NOT_INTERESTED | Bad Fit |

## PlusVibe Webhook Configuration

**Workspace:** David (`678eb62a071ff7544034bcde`)
**Webhook ID:** `6989f15f45fba752e3121ec6`
**Events:** ALL_EMAIL_REPLIES, ALL_POSITIVE_REPLIES, LEAD_MARKED_AS_INTERESTED, LEAD_MARKED_AS_NOT_INTERESTED
