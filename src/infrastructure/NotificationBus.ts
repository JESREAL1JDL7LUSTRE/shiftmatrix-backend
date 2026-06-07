/**
 * NotificationBus — Infrastructure Layer
 *
 * Owns the global Node.js EventEmitter used for Server-Sent Events (SSE).
 * Extracted from Notifications.ts (a collection schema) so that collection
 * files only define database structure and never export runtime state.
 *
 * Both Notifications.ts (producer) and notificationsStream.ts (consumer)
 * import from this neutral module — dependency direction is correct.
 */
import { EventEmitter } from 'events'

export const notificationBus = new EventEmitter()

// Increase max listeners to avoid Node.js warnings in high-concurrency scenarios
notificationBus.setMaxListeners(100)

export function emitNotification(notification: unknown): void {
  notificationBus.emit('new_notification', notification)
}
