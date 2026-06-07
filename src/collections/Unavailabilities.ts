import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins, workerOwnsViaField } from '../access/tenant'

export const Unavailabilities: CollectionConfig = {
  slug: 'unavailabilities',
  admin: {
    useAsTitle: 'reason',
  },
  access: {
    // Admins see all in tenant. Workers see only their own requests.
    read: workerOwnsViaField('workerId'),
    update: tenantAdmins,
    create: tenantUsers, // Workers can request time off
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'workerId',
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
      name: 'startTime',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'endTime',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      defaultValue: 'pending',
      required: true,
    },
  ],
}
