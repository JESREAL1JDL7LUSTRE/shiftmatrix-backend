/**
 * NotificationService — Service Layer
 *
 * Owns the business logic for dispatching notifications.
 * Calls NotificationBus (infrastructure) for SSE broadcast.
 * Placeholder for future SMS/Email broker integration.
 *
 * TODO: Integrate Twilio / Resend once API keys are provisioned.
 */
import { emitNotification } from '../infrastructure/NotificationBus'

export async function dispatchNotification(doc: any): Promise<void> {
  // 1. Broadcast to SSE stream
  emitNotification(doc)

  // 2. External channel dispatch (SMS / Email)
  if (doc.type === 'urgent' || doc.type === 'shift_alert') {
    // TODO: Replace with real Twilio/Resend call
    console.log(`[SIMULATED SMS/EMAIL] To: ${doc.recipientId} | Message: ${doc.message}`)
  }
}
