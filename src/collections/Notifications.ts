import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'
import { EventEmitter } from 'events'

// Global Event Emitter for SSE
export const notificationEmitter = new EventEmitter()

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    useAsTitle: 'message',
  },
  access: {
    read: tenantUsers,
    update: tenantAdmins,
    create: tenantAdmins,
    delete: tenantAdmins,
  },
  hooks: {
    afterChange: [
      ({ doc, operation }) => {
        if (operation === 'create') {
          // Broadcast to SSE Stream
          notificationEmitter.emit('new_notification', doc)
          
          // Simulated SMS/Email logic
          if (doc.type === 'urgent' || doc.type === 'shift_alert') {
            console.log(`[SIMULATED SMS/EMAIL] To: ${doc.recipientId} | Message: ${doc.message}`)
            // TODO: Implement actual Twilio/Resend integration here when API keys are available
          }
        }
        return doc
      }
    ]
  },
  fields: [
    {
      name: 'message',
      type: 'text',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Urgent', value: 'urgent' },
        { label: 'Shift Alert', value: 'shift_alert' },
      ],
      defaultValue: 'info',
      required: true,
    },
    {
      name: 'recipientId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'read',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
