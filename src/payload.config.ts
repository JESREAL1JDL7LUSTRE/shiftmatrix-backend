import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Tenants } from './collections/Tenants'
import { Wards } from './collections/Wards'
import { Certifications } from './collections/Certifications'
import { Shifts } from './collections/Shifts'
import { JobRoles } from './collections/JobRoles'
import { CalendarEvents } from './collections/CalendarEvents'
import { TimeLogs } from './collections/TimeLogs'
import { SchedulingRuns } from './collections/SchedulingRuns'
import { Unavailabilities } from './collections/Unavailabilities'
import { Notifications } from './collections/Notifications'
import { autoFillEndpoint } from './endpoints/autoFillEndpoint'
import { solverWebhookEndpoint } from './endpoints/solverWebhook'
import { notificationsStreamEndpoint } from './endpoints/notificationsStream'
import { clockInEndpoint } from './endpoints/clockInEndpoint'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  cors: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  csrf: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  collections: [
    Users,
    Tenants,
    Wards,
    Certifications,
    Shifts,
    JobRoles,
    CalendarEvents,
    TimeLogs,
    SchedulingRuns,
    Unavailabilities,
    Notifications,
    Media,
  ],
  endpoints: [
    autoFillEndpoint,
    solverWebhookEndpoint,
    notificationsStreamEndpoint,
    clockInEndpoint
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'fallback-secret-key-1234',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shiftmatrix',
    },
    idType: 'uuid',
    push: process.env.NODE_ENV !== 'production', // Automatically pushes schema to NeonDB in dev mode
  }),
  sharp,
  plugins: [],
})
