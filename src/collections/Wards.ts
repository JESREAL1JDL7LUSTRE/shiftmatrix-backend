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
    {
      name: 'geolocation',
      type: 'group',
      fields: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { 
          name: 'radiusMeters', 
          type: 'number', 
          defaultValue: 100,
          admin: { description: 'Radius in meters where a clock-in is considered valid.' }
        },
      ],
    },
    {
      name: 'currentDailyToken',
      type: 'text',
      admin: {
        description: 'Dynamically generated token for QR code proof-of-presence. Staff must scan this to clock in.',
        readOnly: true, // Should only be updated via the API
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
        
        const id = req.routeParams?.id as string;
        if (!id) return Response.json({ error: 'Missing Ward ID' }, { status: 400 });

        // Generate a cryptographically secure 32-character hex string
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');

        try {
          await req.payload.update({
            collection: 'wards',
            id,
            data: {
              currentDailyToken: token,
            },
          });
          return Response.json({ token, message: 'QR Token regenerated successfully' }, { status: 200 });
        } catch (e) {
          return Response.json({ error: 'Failed to update Ward token' }, { status: 500 });
        }
      },
    },
  ],
}
