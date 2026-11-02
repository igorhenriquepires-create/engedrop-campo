import { db } from './db'
import { supabase, supabaseConfigured } from './supabase'
import { now } from './utils'
import type { Client, Evaluation, Field, Property, Report, SyncEntity, SyncQueueItem, Visit, VisitPhoto } from '../types'

export type SyncResult = { ok: boolean; message: string; pending: number }

const remoteTable: Record<SyncEntity, string> = {
  clients: 'clients', properties: 'properties', fields: 'fields', visits: 'visits', evaluations: 'evaluations', photos: 'photos', reports: 'reports'
}

const syncOrder: Record<SyncEntity, number> = {
  clients: 0, properties: 1, fields: 2, visits: 3, evaluations: 4, photos: 5, reports: 6
}

function syncErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const message = typeof details.message === 'string' ? details.message : ''
    const detail = typeof details.details === 'string' && details.details ? ` (${details.details})` : ''
    const hint = typeof details.hint === 'string' && details.hint ? ` ${details.hint}` : ''
    if (message) return `${message}${detail}${hint}`
    if (typeof details.code === 'string') return `Código do banco: ${details.code}`
  }
  return 'Erro de sincronização desconhecido'
}

const tableFor = (entity: SyncEntity) => ({
  clients: db.clients, properties: db.properties, fields: db.fields, visits: db.visits,
  evaluations: db.evaluations, photos: db.photos, reports: db.reports
}[entity])

const baseRemote = (record: any) => ({
  id: record.id,
  created_at: record.createdAt,
  updated_at: record.updatedAt
})

function toRemote(entity: SyncEntity, record: any) {
  const common = baseRemote(record)
  switch (entity) {
    case 'clients': return { ...common, name: record.name, document: record.document ?? null, phone: record.phone ?? null, email: record.email ?? null, notes: record.notes ?? null, archived: record.archived ?? false }
    case 'properties': return { ...common, client_id: record.clientId, name: record.name, city: record.city ?? null, state: record.state ?? null, notes: record.notes ?? null }
    case 'fields': return { ...common, property_id: record.propertyId, name: record.name, area_ha: record.areaHa ?? null, row_spacing_m: record.rowSpacingM ?? null, notes: record.notes ?? null }
    case 'visits': return { ...common, client_id: record.clientId, visit_date: record.date, status: record.status, season: record.season ?? null, technical_manager: record.technicalManager ?? null, notes: record.notes ?? null }
    case 'evaluations': return { ...common, visit_id: record.visitId, client_id: record.clientId, property_id: record.propertyId, field_id: record.fieldId, culture: record.culture, phenological_stage: record.phenologicalStage ?? null, phenological_custom: record.phenologicalCustom ?? null, node_count: record.nodeCount ?? null, nodule_count: record.noduleCount ?? null, observations: record.observations ?? null, row_spacing_m: record.rowSpacingM ?? null, stand_measurements: record.standMeasurements ?? [], stand_plants_per_meter: record.standPlantsPerMeter ?? null, stand_plants_per_hectare: record.standPlantsPerHectare ?? null, stand_source: record.standSource }
    case 'photos': return { ...common, evaluation_id: record.evaluationId, filename: record.filename, mime_type: record.mimeType, caption: record.caption ?? null, position: record.position, storage_path: record.storagePath ?? null }
    case 'reports': return { ...common, visit_id: record.visitId, evaluation_ids: record.evaluationIds, filename: record.filename, storage_path: record.storagePath ?? null, generated_at: record.generatedAt }
  }
}

async function uploadAsset(entity: 'photos' | 'reports', record: VisitPhoto | Report, userId: string) {
  if (!supabase || !record.blob || record.storagePath) return record.storagePath
  const extension = record.filename.split('.').pop() || (entity === 'photos' ? 'jpg' : 'pdf')
  const bucket = entity === 'photos' ? 'visit-photos' : 'visit-reports'
  const path = `${userId}/${record.id}.${extension}`
  // iOS can persist a File wrapper in IndexedDB that loses its backing body
  // between the camera sheet and a later background sync.  Sending the actual
  // bytes (rather than the wrapper) works across Safari/PWA and prevents an
  // empty attachment from blocking the visit, client and evaluations.
  const body = await record.blob.arrayBuffer()
  if (!body.byteLength) return undefined
  const { error } = await supabase.storage.from(bucket).upload(path, body, { upsert: true, contentType: record.blob.type || undefined })
  // A body-less camera file is kept in IndexedDB for the technician. Metadata
  // still synchronizes below, so a single bad asset never blocks the visit.
  if (error && /no content provided/i.test(error.message)) return undefined
  if (error) throw error
  // Safari can reject writing a previously persisted PDF/File wrapper back to
  // IndexedDB. The asset is already safe in private Storage, so cache failure
  // must never stop the visit's metadata from reaching the cloud.
  try {
    await (entity === 'photos' ? db.photos : db.reports).update(record.id, { storagePath: path, updatedAt: now() } as any)
  } catch (error) {
    console.warn(`Could not refresh local ${entity} cache after upload`, error)
  }
  return path
}

async function markSynced(entity: SyncEntity, table: ReturnType<typeof tableFor>, recordId: string) {
  try {
    await table.update(recordId, { syncState: 'synced' } as any)
  } catch (error) {
    // This only affects the local binary cache on some iOS WebKit versions.
    // The authoritative database row has already been saved successfully.
    if (entity !== 'photos' && entity !== 'reports') throw error
    console.warn(`Could not mark local ${entity} cache as synced`, error)
  }
}

async function syncQueueItem(item: SyncQueueItem, userId: string) {
  if (!supabase) return
  const entity = item.entity
  const table = tableFor(entity)
  const remote = supabase.from(remoteTable[entity]) as any
  if (item.action === 'delete') {
    const { error } = await remote.delete().eq('id', item.entityId)
    if (error) throw error
    return
  }
  const record = await table.get(item.entityId) as any
  if (!record) return
  if (entity === 'photos' || entity === 'reports') {
    const storagePath = await uploadAsset(entity, record, userId)
    if (storagePath) record.storagePath = storagePath
  }
  const { error } = await remote.upsert(toRemote(entity, record), { onConflict: 'id' })
  if (error) throw error
  await markSynced(entity, table, record.id)
}

export async function pendingSyncCount() { return db.syncQueue.count() }

export async function syncNow(): Promise<SyncResult> {
  const pending = await db.syncQueue.count()
  if (!supabaseConfigured || !supabase) return { ok: false, message: 'Modo local: configure o Supabase para sincronizar.', pending }
  if (!navigator.onLine) return { ok: false, message: 'Sem conexão. Os dados permanecem seguros neste dispositivo.', pending }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return { ok: false, message: 'Faça login para sincronizar.', pending }
  // A saved parent can be edited after one of its children. Always preserve foreign-key order
  // rather than relying only on the moment an item was last edited.
  const items = (await db.syncQueue.orderBy('createdAt').toArray()).sort((left, right) => {
    const dependencyOrder = syncOrder[left.entity] - syncOrder[right.entity]
    return dependencyOrder || left.createdAt.localeCompare(right.createdAt)
  })
  let completed = 0
  for (const item of items) {
    try {
      await syncQueueItem(item, auth.user.id)
      if (item.id) await db.syncQueue.delete(item.id)
      completed++
    } catch (error) {
      const reason = syncErrorMessage(error)
      if (item.id) await db.syncQueue.update(item.id, { attempts: item.attempts + 1, lastError: reason })
      return { ok: false, message: `Falha ao enviar ${item.entity}: ${reason}`, pending: await db.syncQueue.count() }
    }
  }
  // Pull only after the local queue is empty, so remote data never overwrites an unsynced edit.
  try { await pullRemote() } catch { /* uploads succeeded; the next sync will retry the refresh */ }
  return { ok: true, message: completed ? `${completed} item(ns) sincronizado(s).` : 'Todos os dados já estão sincronizados.', pending: 0 }
}

/** Restores a private Storage asset into IndexedDB when it originated on another device. */
export async function ensurePhotoBlob(photo: VisitPhoto): Promise<VisitPhoto> {
  if (photo.blob || !photo.storagePath || !supabase) return photo
  const { data, error } = await supabase.storage.from('visit-photos').download(photo.storagePath)
  if (error || !data) return photo
  const hydrated = { ...photo, blob: data }
  await db.photos.put(hydrated)
  return hydrated
}

type RemoteEntity = Client | Property | Field | Visit | Evaluation | VisitPhoto | Report
function remoteToLocal(entity: SyncEntity, item: any): RemoteEntity {
  const base = { id: item.id, createdAt: item.created_at, updatedAt: item.updated_at, syncState: 'synced' as const }
  switch (entity) {
    case 'clients': return { ...base, name: item.name, document: item.document ?? undefined, phone: item.phone ?? undefined, email: item.email ?? undefined, notes: item.notes ?? undefined, archived: item.archived }
    case 'properties': return { ...base, clientId: item.client_id, name: item.name, city: item.city ?? undefined, state: item.state ?? undefined, notes: item.notes ?? undefined }
    case 'fields': return { ...base, propertyId: item.property_id, name: item.name, areaHa: item.area_ha ?? undefined, rowSpacingM: item.row_spacing_m ?? undefined, notes: item.notes ?? undefined }
    case 'visits': return { ...base, clientId: item.client_id, date: item.visit_date, status: item.status, season: item.season ?? undefined, technicalManager: item.technical_manager ?? undefined, notes: item.notes ?? undefined }
    case 'evaluations': return { ...base, visitId: item.visit_id, clientId: item.client_id, propertyId: item.property_id, fieldId: item.field_id, culture: item.culture, phenologicalStage: item.phenological_stage ?? undefined, phenologicalCustom: item.phenological_custom ?? undefined, nodeCount: item.node_count ?? undefined, noduleCount: item.nodule_count ?? undefined, observations: item.observations ?? undefined, rowSpacingM: item.row_spacing_m ?? undefined, standMeasurements: item.stand_measurements ?? [], standPlantsPerMeter: item.stand_plants_per_meter ?? undefined, standPlantsPerHectare: item.stand_plants_per_hectare ?? undefined, standSource: item.stand_source ?? 'none' }
    case 'photos': return { ...base, evaluationId: item.evaluation_id, filename: item.filename, mimeType: item.mime_type, caption: item.caption ?? undefined, position: item.position, storagePath: item.storage_path ?? undefined }
    case 'reports': return { ...base, visitId: item.visit_id, evaluationIds: item.evaluation_ids ?? [], filename: item.filename, storagePath: item.storage_path ?? undefined, generatedAt: item.generated_at }
  }
}

/** Downloads server records only after local writes, avoiding an unsynced local overwrite. */
export async function pullRemote() {
  if (!supabase || !navigator.onLine || await db.syncQueue.count()) return
  for (const entity of Object.keys(remoteTable) as SyncEntity[]) {
    const { data, error } = await supabase.from(remoteTable[entity]).select('*')
    if (error) throw error
    if (data?.length) {
      const records = []
      for (const item of data) {
        const incoming = remoteToLocal(entity, item) as any
        // Storage metadata is remote, while the binary may already be safely cached on this device.
        if (entity === 'photos' || entity === 'reports') {
          const cached = await (tableFor(entity) as any).get(incoming.id)
          if (cached?.blob) incoming.blob = cached.blob
        }
        records.push(incoming)
      }
      await (tableFor(entity) as any).bulkPut(records)
    }
  }
}
