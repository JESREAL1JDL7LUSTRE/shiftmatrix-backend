import type { CollectionConfig } from 'payload'
import { tenantUsers, tenantAdmins, workerOwnsViaField } from '../access/tenant'

export const Unavailabilities: CollectionConfig = {
  slug: 'unavailabilities',
  admin: {
    useAsTitle: 'reason',
  },
  access: {
    // Admins see all in tenant. Workers see only their own requests.
    read: workerOwnsViaField('workerId'),
    update: tenantAdmins,
    create: tenantUsers, // Workers can request time off
    delete: tenantAdmins,
  },
  fields: [
    {
      name: 'workerId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'tenantId',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      options: [
        { label: 'Temporary (Date Range)', value: 'temporary' },
        { label: 'Permanent (Recurring)', value: 'permanent' },
      ],
      defaultValue: 'temporary',
      required: true,
    },
    {
      name: 'startTime',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data.type === 'temporary',
      },
    },
    {
      name: 'endTime',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data.type === 'temporary',
      },
    },
    {
      name: 'daysOfWeek',
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
      admin: {
        condition: (data) => data.type === 'permanent',
      },
    },
    {
      name: 'permanentStartTime',
      type: 'text',
      admin: {
        description: 'Time of day (e.g., 09:00) or leave blank for whole day',
        condition: (data) => data.type === 'permanent',
      },
    },
    {
      name: 'permanentEndTime',
      type: 'text',
      admin: {
        description: 'Time of day (e.g., 17:00) or leave blank for whole day',
        condition: (data) => data.type === 'permanent',
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      defaultValue: 'pending',
      required: true,
    },
  ],
}
