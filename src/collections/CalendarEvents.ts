import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const CalendarEvents: CollectionConfig = {
  slug: 'calendar-events',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: tenantUsers,
    update: tenantAdmins,
    create: tenantAdmins,
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      options: [
        { label: 'Holiday', value: 'holiday' },
        { label: 'Break', value: 'break' },
        { label: 'Custom', value: 'custom' },
      ],
      defaultValue: 'holiday',
      required: true,
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly' },
      },
    },
    {
      name: 'endDate',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly' },
      },
    },
    {
      name: 'assignedStaff',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: {
        description: 'Staff assigned to work on this event (e.g. essential workers on a holiday).',
      },
    },
  ],
}
