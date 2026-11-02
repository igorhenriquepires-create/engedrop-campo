import Dexie, { type EntityTable } from 'dexie'
import type { Client, Evaluation, Field, Property, Report, SyncQueueItem, Visit, VisitPhoto } from '../types'

class EngedropDatabase extends Dexie {
  clients!: EntityTable<Client, 'id'>
  properties!: EntityTable<Property, 'id'>
  fields!: EntityTable<Field, 'id'>
  visits!: EntityTable<Visit, 'id'>
  evaluations!: EntityTable<Evaluation, 'id'>
  photos!: EntityTable<VisitPhoto, 'id'>
  reports!: EntityTable<Report, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('engedrop-campo')
    this.version(1).stores({
      clients: 'id, name, updatedAt, syncState',
      properties: 'id, clientId, name, updatedAt, syncState',
      fields: 'id, propertyId, name, updatedAt, syncState',
      visits: 'id, clientId, date, status, updatedAt, syncState',
      evaluations: 'id, visitId, clientId, propertyId, fieldId, culture, updatedAt, syncState',
      photos: 'id, evaluationId, position, updatedAt, syncState',
      reports: 'id, visitId, generatedAt, updatedAt, syncState',
      syncQueue: '++id, entity, entityId, [entity+entityId], createdAt'
    })
  }
}

export const db = new EngedropDatabase()
