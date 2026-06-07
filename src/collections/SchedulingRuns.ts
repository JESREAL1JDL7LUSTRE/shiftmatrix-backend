import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const SchedulingRuns: CollectionConfig = {
  slug: 'schedulingRuns',
  admin: {
    useAsTitle: 'jobId',
    defaultColumns: ['jobId', 'status', 'tenantId', 'createdAt'],
  },
  access: {
    read: tenantUsers,
    create: tenantAdmins,
    update: tenantAdmins,
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'jobId',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
      }
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'errorReason',
      type: 'text',
      admin: {
        condition: (data) => data.status === 'failed'
      }
    },
    {
      name: 'shiftsInvolved',
      type: 'relationship',
      relationTo: 'shifts',
      hasMany: true,
      admin: {
        description: 'The shifts that were attempted to be filled during this run.'
      }
    }
  ]
}
