import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const Shifts: CollectionConfig = {
  slug: 'shifts',
  admin: {
    useAsTitle: 'id',
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
      name: 'ward',
      type: 'relationship',
      relationTo: 'wards',
      required: true,
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
                { label: 'RN', value: 'RN' },
                { label: 'LPN', value: 'LPN' },
                { label: 'CNA', value: 'CNA' },
                { label: 'Technician', value: 'Technician' },
                { label: 'Supervisor', value: 'Supervisor' },
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
