/**
 * notificationsStream — Thin Controller
 *
 * Sets up the SSE stream for authenticated users.
 * Imports notificationBus from the infrastructure layer (not from Notifications.ts).
 */
import type { Endpoint } from 'payload'
import { notificationBus } from '../infrastructure/NotificationBus'

export const notificationsStreamEndpoint: Endpoint = {
  path: '/stream-notifications',
  method: 'get',
  handler: async (req) => {
    let user = req.user

    // If no user in req (e.g. EventSource cannot send Authorization header cross-origin),
    // check the query string for the token.
    if (!user) {
      const url = new URL(req.url)
      const token = url.searchParams.get('token')
      
      if (token) {
        try {
          const jwt = require('jsonwebtoken')
          const decoded = jwt.verify(token, req.payload.secret)
          if (decoded && decoded.id) {
            user = { id: decoded.id } as any
          }
        } catch (err) {
          // invalid token
        }
      }
    }

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userId = user.id

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
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
