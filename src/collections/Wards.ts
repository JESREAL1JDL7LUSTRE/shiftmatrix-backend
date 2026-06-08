import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins } from '../access/tenant'

/**
 * Departments — generic work-area/location entity (previously 'wards').
 * Works for hospitals, warehouses, retail floors, construction sites, etc.
 */
export const Wards: CollectionConfig = {
  slug: 'departments',
  admin: {
    useAsTitle: 'name',
    description: 'A department, zone, floor, or work area within a tenant organisation.',
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
      admin: { description: 'e.g. "ICU Ward A", "Warehouse Bay 3", "Front-of-House"' },
    },
    {
      name: 'location',
      type: 'text',
      admin: { description: 'Physical location descriptor (floor, building, zone, etc.)' },
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
      admin: { description: 'Certifications every staff member must hold to work in this department.' },
    },
    {
      name: 'geolocation',
      type: 'group',
      admin: { description: 'Optional geo-fence for QR clock-in validation.' },
      fields: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        {
          name: 'radiusMeters',
          type: 'number',
          defaultValue: 100,
          admin: { description: 'Radius in metres where a clock-in is considered on-site.' },
        },
      ],
    },
    {
      name: 'currentDailyToken',
      type: 'text',
      admin: {
        description: 'Rotating QR token for proof-of-presence clock-in. Regenerate via POST /:id/generate-qr.',
        readOnly: true,
      },
    },
  ],
  endpoints: [
    {
      path: '/:id/generate-qr',
      method: 'post',
      handler: async (req) => {
        if (!req.user || req.user.role !== 'admin') {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const id = req.routeParams?.id as string
        if (!id) return Response.json({ error: 'Missing Department ID' }, { status: 400 })

        const crypto = require('crypto')
        const token = crypto.randomBytes(16).toString('hex')

        try {
          await req.payload.update({
            collection: 'departments',
            id,
            data: { currentDailyToken: token },
          })
          return Response.json({ token, message: 'QR token regenerated successfully' }, { status: 200 })
        } catch (e) {
          return Response.json({ error: 'Failed to update department token' }, { status: 500 })
        }
      },
    },
  ],
}
