# Starting n8n Development Server

## Quick Start (Backend Only)

```bash
cd packages/cli
npm run dev
```

Or use task-spooler for background execution:
```bash
cd packages/cli
npm run dev
```

## Verify Server is Running

```bash
curl http://localhost:5888/healthz
# Expected: {"status":"ok"}
```

## Access Points

| Service | URL |
|---------|-----|
| Editor UI | http://localhost:5888 |
| Health Check | http://localhost:5888/healthz |
| REST API Settings | http://localhost:5888/rest/settings |

> **Note:** Default port is `5888` (configured in local environment). Standard n8n port is `5678`.

## Alternative: Full Dev Command

From root directory:
```bash
pnpm dev:be
```

This runs turbo to build all backend dependencies in watch mode, but takes longer to start.

## Troubleshooting

### Port Already in Use
```bash
lsof -i :5888
kill -9 <PID>
```

### Check if Server Started
Look for this in the logs:
```
n8n ready on ::, port 5888
Editor is now accessible via:
http://localhost:5888
```

### Playwright Tests Running (Slow)
If `pnpm dev` runs playwright tests, they've been disabled in `package.json`. Make sure you have the latest changes with `--filter=!n8n-playwright`.
