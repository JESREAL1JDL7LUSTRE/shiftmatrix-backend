import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const Shifts: CollectionConfig = {
  slug: 'shifts',
  admin: {
    useAsTitle: 'startTime',
  },
  access: {
    // Ideally we would filter so workers only see their assigned shifts or urgent shifts,
    // but for simplicity here we let all tenant users read shifts for the calendar view.
    read: tenantUsers,
    update: tenantAdmins,
    create: tenantAdmins,
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      required: true,
      admin: { description: 'The department or work area this shift is for.' },
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
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Urgent', value: 'urgent' },
        { label: 'Filled', value: 'filled' },
        { label: 'Closed', value: 'closed' },
      ],
      defaultValue: 'draft',
    },
    {
      name: 'assignedStaff',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
    {
      name: 'staffingRequirements',
      type: 'blocks',
      blocks: [
        {
          slug: 'RoleRequirement',
          fields: [
            {
              name: 'role',
              type: 'select',
              required: true,
              options: [
                { label: 'Staff', value: 'staff' },
                { label: 'Senior Staff', value: 'senior_staff' },
                { label: 'Supervisor', value: 'supervisor' },
                { label: 'Specialist', value: 'specialist' },
                { label: 'Manager', value: 'manager' },
              ],
            },
            {
              name: 'count',
              type: 'number',
              required: true,
              min: 1,
            },
            {
              name: 'mustHaveCerts',
              type: 'relationship',
              relationTo: 'certifications',
              hasMany: true,
            },
          ],
        },
        {
          slug: 'SpecialistReq',
          fields: [
            {
              name: 'cert',
              type: 'relationship',
              relationTo: 'certifications',
              required: true,
            },
            {
              name: 'count',
              type: 'number',
              required: true,
              min: 1,
            },
          ],
        },
        {
          slug: 'SupervisorRequirement',
          fields: [
            {
              name: 'minimumSeniorityYears',
              type: 'number',
              required: true,
              min: 0,
            },
          ],
        },
      ],
    },
  ],
}
