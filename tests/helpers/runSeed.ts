/**
 * runSeed.ts — Standalone seed runner
 *
 * Run with: npm run seed
 *
 * dotenv is loaded via --env-file flag in the npm script, so DATABASE_URL
 * is available before Payload initialises.
 */
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'
import { seedDatabase } from './seed.js'

async function main() {
  console.log('Connecting to Payload...')
  const payload = await getPayload({ config })

  try {
    await seedDatabase(payload)
    console.log('\n✅ Seed completed successfully.')
  } catch (err) {
    console.error('\n❌ Seed failed:', err)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

main()
