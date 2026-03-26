import { prisma } from './prisma'

/**
 * Record field-level changes between old and new data.
 * Only logs fields that actually changed.
 */
export async function logChanges({
  tableName,
  recordId,
  action,
  oldData,
  newData,
  changedBy,
  fields,
}: {
  tableName: string
  recordId: string
  action: 'create' | 'update' | 'delete'
  oldData?: Record<string, any> | null
  newData?: Record<string, any> | null
  changedBy: string
  fields?: string[] // specific fields to track; if omitted, track all
}) {
  const logs: {
    tableName: string
    recordId: string
    action: 'create' | 'update' | 'delete'
    field: string | null
    oldValue: string | null
    newValue: string | null
    changedBy: string
  }[] = []

  if (action === 'create') {
    logs.push({
      tableName,
      recordId,
      action,
      field: null,
      oldValue: null,
      newValue: null,
      changedBy,
    })
  } else if (action === 'delete') {
    logs.push({
      tableName,
      recordId,
      action,
      field: null,
      oldValue: null,
      newValue: null,
      changedBy,
    })
  } else if (action === 'update' && oldData && newData) {
    const trackFields = fields || Object.keys(newData)

    for (const field of trackFields) {
      if (!(field in newData)) continue

      const oldVal = oldData[field]
      const newVal = newData[field]

      const oldStr = stringify(oldVal)
      const newStr = stringify(newVal)

      if (oldStr !== newStr) {
        logs.push({
          tableName,
          recordId,
          action,
          field,
          oldValue: oldStr,
          newValue: newStr,
          changedBy,
        })
      }
    }
  }

  if (logs.length > 0) {
    await prisma.auditLog.createMany({ data: logs })
  }

  return logs.length
}

function stringify(val: any): string | null {
  if (val === null || val === undefined) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}
