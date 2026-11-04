import { db } from './db'
import { now, uid } from './utils'
import type { Client, EntityBase, Evaluation, Field, NewEntity, Property, Report, ReportSnapshot, SyncEntity, SyncQueueItem, Visit, VisitBundle, VisitPhoto } from '../types'

const entityTables = {
  clients: db.clients,
  properties: db.properties,
  fields: db.fields,
  visits: db.visits,
  evaluations: db.evaluations,
  photos: db.photos,
  reports: db.reports
} as const

function toEntity<T extends EntityBase>(value: NewEntity<T>): T {
  const timestamp = now()
  return { ...value, id: value.id ?? uid(), createdAt: value.createdAt ?? timestamp, updatedAt: timestamp, syncState: 'pending' } as T
}

async function queue(entity: SyncEntity, entityId: string) {
  const current = await db.syncQueue.where('[entity+entityId]').equals([entity, entityId]).first()
  if (current?.id) await db.syncQueue.update(current.id, { createdAt: now(), attempts: 0, lastError: undefined, action: 'upsert' })
  else await db.syncQueue.add({ entity, entityId, action: 'upsert', createdAt: now(), attempts: 0 })
}

function requestSync() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('engedrop:sync-request'))
}

export async function saveEntity(entity: SyncEntity, value: NewEntity<EntityBase>): Promise<EntityBase> {
  // A shared persistence path keeps every locally written record queued for sync.
  const record = toEntity(value as NewEntity<EntityBase>)
  await (entityTables[entity] as any).put(record)
  await queue(entity, record.id)
  requestSync()
  return record
}

export async function saveClient(value: NewEntity<Client>) { return saveEntity('clients', value) as Promise<Client> }
export async function saveProperty(value: NewEntity<Property>) { return saveEntity('properties', value) as Promise<Property> }
export async function saveField(value: NewEntity<Field>) { return saveEntity('fields', value) as Promise<Field> }
export async function saveVisit(value: NewEntity<Visit>) { return saveEntity('visits', value) as Promise<Visit> }
export async function saveEvaluation(value: NewEntity<Evaluation>) { return saveEntity('evaluations', value) as Promise<Evaluation> }
export async function savePhoto(value: NewEntity<VisitPhoto>) { return saveEntity('photos', value) as Promise<VisitPhoto> }
export async function saveReport(value: NewEntity<Report>) { return saveEntity('reports', value) as Promise<Report> }

export async function saveVisitBundle(bundle: VisitBundle) {
  await db.transaction('rw', db.visits, db.evaluations, db.photos, db.syncQueue, async () => {
    await db.visits.put(bundle.visit)
    await queue('visits', bundle.visit.id)
    for (const evaluation of bundle.evaluations) {
      await db.evaluations.put(evaluation)
      await queue('evaluations', evaluation.id)
    }
    for (const photo of bundle.photos) {
      await db.photos.put(photo)
      await queue('photos', photo.id)
    }
  })
  requestSync()
}

export async function getVisitBundle(visitId: string): Promise<VisitBundle | undefined> {
  const visit = await db.visits.get(visitId)
  if (!visit) return undefined
  const evaluations = await db.evaluations.where('visitId').equals(visitId).toArray()
  const photos = (await Promise.all(evaluations.map(item => db.photos.where('evaluationId').equals(item.id).toArray()))).flat()
  return { visit, evaluations, photos }
}

/**
 * Restores only records that are absent locally from the snapshot kept with a
 * report. It never overwrites a newer client, visit, evaluation or photo.
 */
export async function restoreReportSnapshot(reportId: string) {
  const report = await db.reports.get(reportId)
  const snapshot: ReportSnapshot | undefined = report?.sourceSnapshot
  if (!snapshot) return 0
  let restored = 0
  await (db.transaction as any)('rw', db.clients, db.properties, db.fields, db.visits, db.evaluations, db.photos, db.syncQueue, async () => {
    const restore = async (entity: SyncEntity, table: any, record: any) => {
      if (await table.get(record.id)) return
      const recovered = { ...record, syncState: 'pending' as const, updatedAt: now() }
      await table.put(recovered)
      await queue(entity, recovered.id)
      restored++
    }
    await restore('clients', db.clients, snapshot.client)
    for (const property of snapshot.properties) await restore('properties', db.properties, property)
    for (const field of snapshot.fields) await restore('fields', db.fields, field)
    await restore('visits', db.visits, snapshot.visit)
    for (const evaluation of snapshot.evaluations) await restore('evaluations', db.evaluations, evaluation)
    for (const photo of snapshot.photos) await restore('photos', db.photos, photo)
  })
  if (restored) requestSync()
  return restored
}

export async function removePhoto(id: string) {
  await db.photos.delete(id)
  const current = await db.syncQueue.where('[entity+entityId]').equals(['photos', id]).first()
  const payload: SyncQueueItem = { entity: 'photos', entityId: id, action: 'delete', createdAt: now(), attempts: 0 }
  if (current?.id) await db.syncQueue.update(current.id, payload)
  else await db.syncQueue.add(payload)
  requestSync()
}

export async function removeEvaluation(id: string) {
  await db.transaction('rw', db.evaluations, db.photos, db.syncQueue, async () => {
    const photos = await db.photos.where('evaluationId').equals(id).toArray()
    for (const photo of photos) {
      await db.photos.delete(photo.id)
      const current = await db.syncQueue.where('[entity+entityId]').equals(['photos', photo.id]).first()
      const payload: SyncQueueItem = { entity: 'photos', entityId: photo.id, action: 'delete', createdAt: now(), attempts: 0 }
      if (current?.id) await db.syncQueue.update(current.id, payload)
      else await db.syncQueue.add(payload)
    }
    await db.evaluations.delete(id)
    const current = await db.syncQueue.where('[entity+entityId]').equals(['evaluations', id]).first()
    const payload: SyncQueueItem = { entity: 'evaluations', entityId: id, action: 'delete', createdAt: now(), attempts: 0 }
    if (current?.id) await db.syncQueue.update(current.id, payload)
    else await db.syncQueue.add(payload)
  })
  requestSync()
}

export async function dashboardData() {
  const [clients, properties, fields, visits, recent] = await Promise.all([
    db.clients.count(), db.properties.count(), db.fields.count(), db.visits.count(),
    db.visits.orderBy('date').reverse().limit(6).toArray()
  ])
  return { clients, properties, fields, visits, recent }
}

export type LocalRecoveryStatus = {
  visits: number
  drafts: number
  evaluations: number
  photos: number
  pending: number
  orphanEvaluations: number
}

/** Read-only inventory used before any recovery action. */
export async function localRecoveryStatus(): Promise<LocalRecoveryStatus> {
  const [visits, evaluations, photos, pending] = await Promise.all([
    db.visits.toArray(), db.evaluations.toArray(), db.photos.count(), db.syncQueue.count()
  ])
  const visitIds = new Set(visits.map(item => item.id))
  return {
    visits: visits.length,
    drafts: visits.filter(item => item.status === 'draft').length,
    evaluations: evaluations.length,
    photos,
    pending,
    orphanEvaluations: evaluations.filter(item => !visitIds.has(item.visitId)).length
  }
}

/**
 * Repairs only the recoverable case where a locally stored evaluation survived
 * but its parent draft record did not. Existing visits are never replaced.
 */
export async function restoreOrphanedDrafts() {
  let restored = 0
  await db.transaction('rw', db.visits, db.evaluations, db.syncQueue, async () => {
    const [visits, evaluations] = await Promise.all([db.visits.toArray(), db.evaluations.toArray()])
    const visitIds = new Set(visits.map(item => item.id))
    for (const evaluation of evaluations) {
      if (visitIds.has(evaluation.visitId)) continue
      const timestamp = evaluation.updatedAt || evaluation.createdAt || now()
      const restoredVisit: Visit = {
        id: evaluation.visitId,
        clientId: evaluation.clientId,
        date: timestamp.slice(0, 10),
        status: 'draft',
        createdAt: evaluation.createdAt || timestamp,
        updatedAt: timestamp,
        syncState: 'pending'
      }
      await db.visits.put(restoredVisit)
      await queue('visits', restoredVisit.id)
      visitIds.add(restoredVisit.id)
      restored++
    }
  })
  if (restored) requestSync()
  return restored
}
