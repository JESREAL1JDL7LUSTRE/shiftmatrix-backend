import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const JobRoles: CollectionConfig = {
  slug: 'job-roles',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: tenantUsers,
    update: tenantAdmins,
    create: tenantAdmins,
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Name of the role (e.g., Security Guard, Janitor, Supervisor)',
      },
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'defaultStartTime',
      type: 'text',
      admin: {
        description: 'Default start time in HH:mm format (e.g., 06:00)',
      },
    },
    {
      name: 'defaultEndTime',
      type: 'text',
      admin: {
        description: 'Default end time in HH:mm format (e.g., 14:00)',
      },
    },
    {
      name: 'colorCode',
      type: 'text',
      defaultValue: '#28CB8B',
      admin: {
        description: 'Hex color code for UI display (e.g., #28CB8B)',
      },
    },
  ],
}
