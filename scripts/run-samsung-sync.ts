import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  console.log('삼성 동기화 시작...')
  const { syncSamsungSchedule } = await import('../src/lib/sync/samsung-schedule')
  const result = await syncSamsungSchedule()
  console.log(JSON.stringify(result, null, 2))
}
main().catch(console.error).finally(() => process.exit(0))
