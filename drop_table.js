import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '.env') })

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
})

async function run() {
  await client.connect()
  try {
    await client.query('DROP TABLE IF EXISTS "shifts_blocks_specialist_requirement" CASCADE;')
    console.log('Table dropped successfully')
  } catch (err) {
    console.error('Error dropping table:', err)
  } finally {
    await client.end()
  }
}

run()
