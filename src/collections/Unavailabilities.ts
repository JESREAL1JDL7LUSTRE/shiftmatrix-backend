import type { CollectionConfig, Where } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const Unavailabilities: CollectionConfig = {
  slug: 'unavailabilities',
  admin: {
    useAsTitle: 'reason',
  },
  access: {
    // Workers can see their own, admins see all in tenant
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin' || user.role === 'superadmin') {
        return {
          tenantId: {
            equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
          },
        } as Where
      }
      return {
        workerId: {
          equals: user.id,
        },
      } as Where
    },
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
