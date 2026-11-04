export type VisitStatus = 'draft' | 'finalized'
export type SyncState = 'pending' | 'synced' | 'error'
export type StandSource = 'calculated' | 'manual' | 'none'

export interface EntityBase {
  id: string
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export interface Client extends EntityBase {
  name: string
  document?: string
  phone?: string
  email?: string
  notes?: string
  archived?: boolean
}

export interface Property extends EntityBase {
  clientId: string
  name: string
  city?: string
  state?: string
  notes?: string
}

export interface Field extends EntityBase {
  propertyId: string
  name: string
  areaHa?: number
  rowSpacingM?: number
  notes?: string
}

export interface Visit extends EntityBase {
  clientId: string
  date: string
  status: VisitStatus
  season?: string
  technicalManager?: string
  notes?: string
}

export interface StandMeasurement {
  plants: number
  lengthM: number
}

export interface Evaluation extends EntityBase {
  visitId: string
  clientId: string
  propertyId: string
  fieldId: string
  culture: string
  phenologicalStage?: string
  phenologicalCustom?: string
  nodeCount?: number
  noduleCount?: number
  observations?: string
  rowSpacingM?: number
  standMeasurements: StandMeasurement[]
  standPlantsPerMeter?: number
  standPlantsPerHectare?: number
  standSource: StandSource
}

export interface VisitPhoto extends EntityBase {
  evaluationId: string
  filename: string
  mimeType: string
  caption?: string
  position: number
  blob?: Blob
  storagePath?: string
}

/** A lightweight local safety copy attached to every newly generated PDF. */
export interface ReportSnapshot {
  client: Client
  properties: Property[]
  fields: Field[]
  visit: Visit
  evaluations: Evaluation[]
  // Image bytes stay in their own photo records; the snapshot keeps the
  // identity, captions and ordering without duplicating a large gallery.
  photos: Array<Omit<VisitPhoto, 'blob'>>
}

export interface Report extends EntityBase {
  visitId: string
  evaluationIds: string[]
  filename: string
  blob?: Blob
  storagePath?: string
  sourceSnapshot?: ReportSnapshot
  generatedAt: string
}

export type SyncEntity = 'clients' | 'properties' | 'fields' | 'visits' | 'evaluations' | 'photos' | 'reports'

export interface SyncQueueItem {
  id?: number
  entity: SyncEntity
  entityId: string
  action: 'upsert' | 'delete'
  createdAt: string
  attempts: number
  lastError?: string
}

export interface VisitBundle {
  visit: Visit
  evaluations: Evaluation[]
  photos: VisitPhoto[]
}

export type NewEntity<T extends EntityBase> = Omit<T, keyof EntityBase> & Partial<Pick<EntityBase, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>>
