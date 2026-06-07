import type { CollectionConfig } from 'payload'
import { tenantAdmins } from '../access/tenant'

export const TimeLogs: CollectionConfig = {
  slug: 'timeLogs',
  access: {
    // Restrict read to admins. Workers should only see their own (can add custom logic).
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin' || user.role === 'superadmin') {
        return {
          tenantId: {
            equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
          },
        }
      }
      return {
        staffId: {
          equals: user.id,
        },
      }
    },
    // Creation shouldn't happen through standard REST by workers, it will use custom endpoint
    update: tenantAdmins,
    create: tenantAdmins,
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'staffId',
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
      name: 'shiftId',
      type: 'relationship',
      relationTo: 'shifts',
      required: false,
    },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      options: [
        { label: 'Clock In', value: 'clock_in' },
        { label: 'Clock Out', value: 'clock_out' },
        { label: 'Break Start', value: 'break_start' },
        { label: 'Break End', value: 'break_end' },
        { label: 'Correction', value: 'correction' },
      ],
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'ipAddress',
      type: 'text',
    },
    {
      name: 'geolocation',
      type: 'group',
      fields: [
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
      ],
    },
    {
      name: 'geofenceStatus',
      type: 'select',
      options: [
        { label: 'Within Bounds', value: 'within_bounds' },
        { label: 'Outside Bounds', value: 'outside_bounds' },
        { label: 'Not Checked', value: 'not_checked' },
      ],
      defaultValue: 'not_checked',
    },
    {
      name: 'correctionNote',
      type: 'textarea',
      admin: {
        condition: (data) => data?.eventType === 'correction',
      },
    },
  ],
}
