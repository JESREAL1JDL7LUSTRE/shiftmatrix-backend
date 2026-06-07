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
import { TimeLogs } from './collections/TimeLogs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Tenants,
    Wards,
    Certifications,
    Shifts,
    TimeLogs,
    Media,
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
    push: process.env.NODE_ENV !== 'production', // Automatically pushes schema to NeonDB in dev mode
  }),
  sharp,
  plugins: [],
})
