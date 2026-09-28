# ChatApp Frontend

React + Vite client for ChatApp. See the [root README](../README.md) for features, setup and environment variables.

## Layout

| Path | Purpose |
|---|---|
| `src/context/` | Auth (multi-account), Theme, Socket, Chat (conversation list, unread counts, typing), Call (call state machine) |
| `src/hooks/useAgoraCall.js` | Agora engine: HD tracks, join/leave, mute, camera flip, token renewal |
| `src/components/sidebar/` | Navigation, chat list, calls history, settings & account switcher |
| `src/components/chat/` | Chat window, bubbles, composer (emoji, stickers, attachments, voice notes), menus, viewers |
| `src/components/call/` | Full-screen call UI, incoming banner, minimized call pill |
| `src/styles/` | Design tokens (light/dark) and component styles |
| `public/sw.js`, `public/manifest.webmanifest` | Installable PWA: service worker and app manifest |
