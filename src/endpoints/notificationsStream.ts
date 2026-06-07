/**
 * notificationsStream — Thin Controller
 *
 * Sets up the SSE stream for authenticated users.
 * Imports notificationBus from the infrastructure layer (not from Notifications.ts).
 */
import type { Endpoint } from 'payload'
import { notificationBus } from '../infrastructure/NotificationBus'

export const notificationsStreamEndpoint: Endpoint = {
  path: '/notifications/stream',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userId = req.user.id

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const stream = new ReadableStream({
      start(controller) {
        // Initial heartbeat
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
        )

        const listener = (notification: any) => {
          const recipientId =
            typeof notification.recipientId === 'object'
              ? notification.recipientId.id
              : notification.recipientId
          if (recipientId === userId) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(notification)}\n\n`)
            )
          }
        }

        notificationBus.on('new_notification', listener)

        // Keep-alive ping every 15 seconds
        const interval = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        }, 15_000)

        req.signal?.addEventListener('abort', () => {
          notificationBus.off('new_notification', listener)
          clearInterval(interval)
          controller.close()
        })
      },
    })

    return new Response(stream, { headers })
  },
}
