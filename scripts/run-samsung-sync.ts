import { config } from 'dotenv'
config({ path: '.env.local' })

import { syncSamsungSchedule } from '../src/lib/sync/samsung-schedule'

async function main() {
  console.log('삼성 동기화 시작...')
  const result = await syncSamsungSchedule()
  console.log(JSON.stringify(result, null, 2))
}
main().catch(console.error).finally(() => process.exit(0))
