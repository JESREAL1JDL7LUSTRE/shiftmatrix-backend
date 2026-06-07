/**
 * QueueService — Infrastructure Layer
 *
 * Owns the ioredis connection. Uses lazy instantiation so that importing
 * this module does NOT open a TCP socket until the first actual enqueue call.
 *
 * This is the single place to swap Redis for another queue (BullMQ, SQS, etc.)
 * without touching any business logic or endpoint code.
 */
import Redis from 'ioredis'

const QUEUE_NAME = 'shift_solver_queue'

let _client: Redis | null = null

function getClient(): Redis {
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379/0')
  }
  return _client
}

export async function enqueueJob(payload: object): Promise<void> {
  await getClient().lpush(QUEUE_NAME, JSON.stringify(payload))
}

/** Only used in tests that need to assert queue state */
export function getRedisClient(): Redis {
  return getClient()
}
