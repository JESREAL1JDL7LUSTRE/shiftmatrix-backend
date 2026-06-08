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
      name: 'jobRole',
      type: 'relationship',
      relationTo: 'job-roles',
      admin: {
        description: 'The specific job title/role for scheduling (e.g., Security Guard)',
      },
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
      defaultValue: 40,
      admin: {
        description: 'Maximum hours this person can be scheduled per week.',
      },
    },
    {
      name: 'certifications',
      type: 'relationship',
      relationTo: 'certifications',
      hasMany: true,
      admin: {
        description: 'Qualifications/licences held by this staff member.',
      },
    },
    {
      name: 'preferences',
      type: 'group',
      fields: [
        {
          name: 'preferredDepartments',
          type: 'relationship',
          relationTo: 'departments',
          hasMany: true,
          admin: { description: 'Departments this staff member prefers to be scheduled in.' },
        },
        {
          name: 'unavailableDates',
          type: 'array',
          // ⚠️  DEPRECATED — This field is NOT read by the CP-SAT solver.
          // Submit time-off requests through the Unavailabilities collection instead.
          admin: {
            description:
              '⚠️ DEPRECATED: Ignored by the scheduling solver. Use the Unavailabilities collection instead.',
          },
          fields: [
            { name: 'startDate', type: 'date', required: true },
            { name: 'endDate', type: 'date', required: true },
          ],
        },
      ],
    },
  ],
}
