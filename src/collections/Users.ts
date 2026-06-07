import type { CollectionConfig } from 'payload'
import { isSelfOrTenantAdmin, tenantAdmins, isSuperAdmin } from '../access/tenant'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    read: isSelfOrTenantAdmin,
    update: isSelfOrTenantAdmin, // Workers can only update their own preferences
    create: tenantAdmins, // Only admins can create users within their tenant
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: [
        { label: 'Super Admin', value: 'superadmin' },
        { label: 'Admin', value: 'admin' },
        { label: 'Supervisor', value: 'supervisor' },
        { label: 'Worker', value: 'worker' },
      ],
      defaultValue: 'worker',
      access: {
        update: ({ req: { user } }) => user?.role === 'admin' || user?.role === 'superadmin',
      },
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      access: {
        update: ({ req: { user } }) => user?.role === 'superadmin', // Only superadmin can change tenant
      },
    },
    {
      name: 'maxWeeklyHours',
      type: 'number',
      admin: {
        condition: (data) => data?.role === 'worker',
      },
    },
    {
      name: 'certifications',
      type: 'relationship',
      relationTo: 'certifications',
      hasMany: true,
      admin: {
        condition: (data) => data?.role === 'worker',
      },
    },
    {
      name: 'preferences',
      type: 'group',
      admin: {
        condition: (data) => data?.role === 'worker',
      },
      fields: [
        {
          name: 'preferredWards',
          type: 'relationship',
          relationTo: 'wards',
          hasMany: true,
        },
        {
          name: 'unavailableDates',
          type: 'array',
          fields: [
            {
              name: 'startDate',
              type: 'date',
              required: true,
            },
            {
              name: 'endDate',
              type: 'date',
              required: true,
            },
          ],
        },
      ],
    },
  ],
}
