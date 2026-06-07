# Real-Time Notifications (SSE)

ShiftMatrix requires real-time UI updates when urgent shifts are published or when a scheduling run completes. We achieve this using **Server-Sent Events (SSE)**.

## Architecture

Unlike WebSockets, SSE is a unidirectional stream (Server -> Client) over a standard HTTP connection. It is lightweight, firewall-friendly, and perfectly suited for notifications.

1. **The Event Emitter**:
   We maintain a global Node.js `EventEmitter` in `src/collections/Notifications.ts`.

2. **Payload Lifecycle Hooks**:
   When a new record is created in the `Notifications` collection, Payload's `afterChange` hook catches it and broadcasts it to the global emitter:
   
   ```typescript
   export const afterNotificationChange: CollectionAfterChangeHook = async ({ doc, operation }) => {
     if (operation === 'create') {
       notificationEmitter.emit(`notification_${doc.tenantId}`, doc)
     }
     return doc
   }
   ```

3. **The SSE Endpoint**:
   The frontend connects to `GET /api/notifications/stream`.
   - We set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
   - The user's authentication token is verified.
   - We attach a listener to `notification_${user.tenantId}`.
   - As events emit, we write them to the open HTTP response stream.

## Frontend Usage (SvelteKit)
The frontend uses standard browser `EventSource` to listen to this endpoint:

```javascript
const eventSource = new EventSource('/api/notifications/stream');
eventSource.onmessage = (event) => {
    const newNotification = JSON.parse(event.data);
    // Display toast popup
};
```
