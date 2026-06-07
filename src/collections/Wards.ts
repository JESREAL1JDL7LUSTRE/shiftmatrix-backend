import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

export const Wards: CollectionConfig = {
  slug: 'wards',
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
      name: 'floor',
      type: 'text',
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'requiredBaseCertifications',
      type: 'relationship',
      relationTo: 'certifications',
      hasMany: true,
    },
  ],
}
