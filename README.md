# zenithDesk-chat

A standalone, embeddable chat widget that lets customers create ZenithDesk
support tickets through natural conversation, using a locally-hosted Small
Language Model (SLM) via Ollama to extract structured ticket data from chat
messages.

See [`zenithdesk-chatbot-architecture.md`](./zenithdesk-chatbot-architecture.md)
for the full architecture and phased build plan.

## Project structure

- `server/` — Node.js + Express service: chat endpoint, Ollama client,
  structured extraction, ticket creation
- `client/` — React (Vite) embeddable chat widget

## Setup

### Server

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

The API starts on `http://localhost:4000` (or `PORT` from `.env`). A
`GET /health` route confirms the server is running.

### Client

```bash
cd client
npm install
npm run dev
```
