import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const Certifications: CollectionConfig = {
  slug: 'certifications',
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
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'validityPeriodDays',
      type: 'number',
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
  ],
}
