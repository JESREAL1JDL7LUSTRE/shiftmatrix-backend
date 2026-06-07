# Real-Time Notifications

ShiftMatrix delivers in-app notifications to connected clients using **Server-Sent Events (SSE)**. The notification pipeline uses a global Node.js `EventEmitter` (the `NotificationBus`) to decouple producers from consumers.

---

## Architecture Overview

```
[Payload CMS Collection Hook]
           │
           │ afterChange (Notifications collection)
           ▼
[NotificationService.dispatchNotification(doc)]
           │
           │ emitNotification(doc)
           ▼
[NotificationBus — global EventEmitter]
           │
           │ emit('new_notification', doc)
           ▼
[notificationsStream.ts — SSE endpoint]
           │
           │ Server-Sent Event: data: {...}\n\n
           ▼
[Frontend EventSource listener]
```

### Key Design Choices

| Choice | Rationale |
|---|---|
| In-process EventEmitter (not Redis Pub/Sub) | Simpler; sufficient for a single Node.js process (Payload runs in one process) |
| SSE over WebSockets | Simpler server-side; one-directional push is all notifications need |
| `setMaxListeners(100)` | Prevents Node.js memory leak warning when >10 SSE clients connect simultaneously |
| Heartbeat every 15s | Keeps the connection alive through HTTP proxies and load balancers that time out idle connections |

---

## Infrastructure: `NotificationBus.ts`

**File:** `src/infrastructure/NotificationBus.ts`

```typescript
import { EventEmitter } from 'events'

// Single global EventEmitter instance shared across all modules
export const notificationBus = new EventEmitter()

// Raised from 10 (default) to support many concurrent SSE connections
notificationBus.setMaxListeners(100)

// Event name constant — use this instead of the string literal
const EVENT_NAME = 'new_notification'

export function emitNotification(notification: unknown): void {
  notificationBus.emit(EVENT_NAME, notification)
}
```

**Exported symbols:**

| Export | Type | Description |
|---|---|---|
| `notificationBus` | `EventEmitter` | The singleton bus — import to `.on()` or `.off()` listeners |
| `emitNotification(doc)` | `(doc: unknown) => void` | Emit a notification event — called by `NotificationService` |

**Do not** import `notificationBus` directly from endpoints to emit events. Always go through `NotificationService.dispatchNotification()`.

---

## Producer Path

### Step 1: Collection hook (`Notifications.ts`)

```typescript
// src/collections/Notifications.ts (hooks section)
{
  hooks: {
    afterChange: [
      async ({ doc }) => {
        await dispatchNotification(doc)
      },
    ],
  },
}
```

The `afterChange` hook fires whenever a `Notification` document is created or updated. It calls `dispatchNotification` with the full Payload document.

### Step 2: `NotificationService.dispatchNotification()`

```typescript
// src/services/NotificationService.ts
import { emitNotification } from '@/infrastructure/NotificationBus'

export async function dispatchNotification(doc: Notification): Promise<void> {
  // 1. Emit to all connected SSE clients
  emitNotification(doc)

  // 2. TODO: Replace with real integrations when API keys provisioned
  console.log(`[NotificationService] Dispatched notification: ${doc.id}`)
  // await twilioClient.messages.create({ to: recipientPhone, body: doc.message })
  // await resend.emails.send({ to: recipientEmail, subject: doc.message })
}
```

### Step 3: `NotificationBus.emitNotification()`

Calls `notificationBus.emit('new_notification', doc)`, which synchronously invokes all registered listeners.

---

## Consumer Path: SSE Endpoint

**File:** `src/endpoints/notificationsStream.ts`

```typescript
export const notificationsStreamEndpoint: Endpoint = {
  path: '/notifications/stream',
  method: 'get',
  handler: async (req, res) => {
    // 1. Auth check
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // 2. Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    // 3. Send initial connection confirmation
    res.write('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n')

    // 4. Register listener on the notification bus
    const onNotification = (notification: unknown) => {
      res.write('data: ' + JSON.stringify(notification) + '\n\n')
    }
    notificationBus.on('new_notification', onNotification)

    // 5. Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
    }, 15_000)

    // 6. Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat)
      notificationBus.off('new_notification', onNotification)
    })
  },
}
```

**Key cleanup:** The `req.on('close')` handler **must** remove the listener with `.off()` to prevent memory leaks when clients disconnect. The `clearInterval(heartbeat)` prevents orphaned timers.

---

## Frontend Usage

### Basic EventSource connection

```javascript
// Connect to the SSE stream
const evtSource = new EventSource('/api/notifications/stream')

evtSource.onmessage = (event) => {
  const notification = JSON.parse(event.data)

  // Ignore the connection confirmation
  if (notification.type === 'connected') return

  // Show the notification in the UI
  showNotificationToast({
    message: notification.message,
    type: notification.type,      // 'info' | 'urgent' | 'shift_alert'
    id: notification.id,
  })

  // Mark as read via Payload REST API
  fetch(`/api/notifications/${notification.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true }),
  })
}

evtSource.onerror = (err) => {
  console.warn('SSE connection error — browser will auto-reconnect', err)
}

// Always close when the user navigates away
window.addEventListener('beforeunload', () => evtSource.close())
```

### With authentication (if using Bearer token instead of cookie)

Standard `EventSource` does not support custom headers. Use one of these approaches:

**Option A — Pass token as query param (simple, less secure):**
```javascript
const token = localStorage.getItem('payload-token')
const evtSource = new EventSource(`/api/notifications/stream?token=${token}`)
```

**Option B — Use `fetch` with a `ReadableStream`:**
```javascript
const response = await fetch('/api/notifications/stream', {
  headers: { Authorization: `Bearer ${token}` },
})
const reader = response.body.getReader()
// Parse SSE format manually
```

> Payload CMS uses **HTTP-only cookies** for JWT by default, so standard `EventSource` works without headers for most setups.

---

## Notification Types

| `type` value | When used | Display suggestion |
|---|---|---|
| `info` | General information messages | Blue info toast |
| `urgent` | Time-sensitive alerts requiring action | Red alert banner |
| `shift_alert` | Shift filled, shift cancelled, or scheduling run completed | Orange shift badge |

---

## TODO: SMS and Email Integration

The `TODO` comment in `NotificationService.ts` marks the integration points for future channels:

```typescript
// TODO: Replace console.log with real Twilio/Resend when API keys provisioned

// SMS via Twilio:
// const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
// await twilioClient.messages.create({
//   to: recipientUser.phone,
//   from: process.env.TWILIO_PHONE_NUMBER,
//   body: doc.message,
// })

// Email via Resend:
// const { Resend } = require('resend')
// const resend = new Resend(process.env.RESEND_API_KEY)
// await resend.emails.send({
//   from: 'ShiftMatrix <noreply@shiftmatrix.com>',
//   to: recipientUser.email,
//   subject: `ShiftMatrix: ${doc.type}`,
//   text: doc.message,
// })
```

**Steps to enable:**
1. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (or `RESEND_API_KEY`) to `.env`
2. Install the SDK: `npm install twilio` or `npm install resend`
3. Uncomment and replace the `console.log` in `NotificationService.ts`
4. Fetch the `recipientId` user document within `dispatchNotification()` to get `phone`/`email`
