import type { CollectionConfig } from 'payload'
import { tenantAdmins, tenantReadAccess, isSuperAdmin } from '../access/tenant'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: tenantReadAccess,
    update: tenantAdmins,
    create: isSuperAdmin, // Only superadmins can create new tenants
    delete: isSuperAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'plan',
      type: 'select',
      required: true,
      options: [
        { label: 'Basic', value: 'basic' },
        { label: 'Compliance', value: 'compliance' },
        { label: 'Enterprise', value: 'enterprise' },
      ],
      defaultValue: 'basic',
    },
    {
      name: 'TenantSettings',
      type: 'blocks',
      blocks: [
        {
          slug: 'FeatureToggles',
          fields: [
            { name: 'enableOvertimeTracking', type: 'checkbox', defaultValue: false },
            { name: 'requireGeoFencedLogins', type: 'checkbox', defaultValue: false },
            { name: 'activateUnionRestRules', type: 'checkbox', defaultValue: false },
            { name: 'enableShiftBidding', type: 'checkbox', defaultValue: false },
            { name: 'enableSMSNotifications', type: 'checkbox', defaultValue: false },
            { name: 'enableAuditReports', type: 'checkbox', defaultValue: false },
            { name: 'maxWeeklyHours', type: 'number', defaultValue: 40 },
            { name: 'lunchStartTime', type: 'text', defaultValue: '12:00', admin: { description: 'Global lunch start time (24h format)' } },
            { name: 'lunchEndTime', type: 'text', defaultValue: '13:00', admin: { description: 'Global lunch end time (24h format)' } },
            {
              name: 'defaultWorkDays',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Monday', value: 'monday' },
                { label: 'Tuesday', value: 'tuesday' },
                { label: 'Wednesday', value: 'wednesday' },
                { label: 'Thursday', value: 'thursday' },
                { label: 'Friday', value: 'friday' },
                { label: 'Saturday', value: 'saturday' },
                { label: 'Sunday', value: 'sunday' },
              ],
              defaultValue: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            },
          ],
        },
      ],
    },
  ],
}
