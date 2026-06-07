import { PayloadHandler, Endpoint } from 'payload'
import { notificationEmitter } from '../collections/Notifications'

export const notificationsStreamEndpoint: Endpoint = {
  path: '/notifications/stream',
  method: 'get',
  handler: async (req) => {
    // Only allow authenticated users to listen to their own notifications
    if (!req.user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const userId = req.user.id
    
    // Set up SSE headers
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Allow CORS for the SvelteKit frontend (adjust as needed for production)
      'Access-Control-Allow-Origin': '*',
    })

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection heartbeat
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

        // Listener for new notifications
        const listener = (notification: any) => {
          const recipientId = typeof notification.recipientId === 'object' ? notification.recipientId.id : notification.recipientId
          // Only send if the notification is for the connected user
          if (recipientId === userId) {
            const data = JSON.stringify(notification)
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
          }
        }

        notificationEmitter.on('new_notification', listener)

        // Heartbeat every 15 seconds to keep connection alive
        const interval = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        }, 15000)

        // Cleanup on disconnect
        req.signal?.addEventListener('abort', () => {
          notificationEmitter.off('new_notification', listener)
          clearInterval(interval)
          controller.close()
        })
      }
    })

    return new Response(stream, { headers })
  }
}
