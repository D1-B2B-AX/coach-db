import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  console.log('동기화 시작...')
  const { syncEngagements } = await import('../src/lib/sync/engagements')
  const result = await syncEngagements('script')
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => process.exit())
