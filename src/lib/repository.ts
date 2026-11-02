import { db } from './db'
import { now, uid } from './utils'
import type { Client, EntityBase, Evaluation, Field, NewEntity, Property, Report, SyncEntity, SyncQueueItem, Visit, VisitBundle, VisitPhoto } from '../types'

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
