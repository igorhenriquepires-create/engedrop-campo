import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const logoBytes = await readFile(resolve(root, 'public', 'engedrop-logo-white.png'))
const logoDataUrl = `data:image/png;base64,${logoBytes.toString('base64')}`

class BrowserFileReader {
  result = null
  onload = null
  onerror = null
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
      this.onload?.()
    }).catch(error => { this.onerror?.(error) })
  }
}

class BrowserImage {
  naturalWidth = 1600
  naturalHeight = 620
  onload = null
  onerror = null
  set src(_value) { queueMicrotask(() => this.onload?.()) }
}

globalThis.FileReader = BrowserFileReader
globalThis.Image = BrowserImage
globalThis.fetch = async () => new Response(logoBytes, { status: 200, headers: { 'content-type': 'image/png' } })
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toDataURL: () => logoDataUrl
  })
}

const { createVisitPdf } = await import('../src/lib/reporting.ts')

const stamp = '2026-11-03T12:00:00.000Z'
const imageBlob = new Blob([logoBytes], { type: 'image/png' })
const longCaption = 'Registro técnico com descrição extensa para validar quebra de linha, alinhamento da legenda e a permanência do texto junto à fotografia correspondente no relatório.'
const observation = 'A lavoura apresenta desenvolvimento uniforme e bom fechamento de entrelinhas. Foram observados nódulos ativos e distribuição de plantas dentro do esperado. Recomenda-se manter o monitoramento semanal, registrar possíveis focos de pragas e acompanhar a umidade do solo nas próximas aplicações.'

function contextFor(photoCount, longCaptions = true) {
  const visitId = `visit-${photoCount}`
  const evaluationId = `evaluation-${photoCount}`
  return {
    visit: { id: visitId, clientId: 'client-1', date: '2026-11-03', status: 'finalized', season: '2026/27', technicalManager: 'Equipe Técnica Engedrop', notes: photoCount === 10 ? `${observation} ${observation}` : observation, createdAt: stamp, updatedAt: stamp, syncState: 'synced' },
    client: { id: 'client-1', name: 'André Martins', phone: ' ', createdAt: stamp, updatedAt: stamp, syncState: 'synced' },
    properties: [{ id: 'property-1', clientId: 'client-1', name: 'Fazenda Modelo', city: 'Rio Verde', state: 'GO', createdAt: stamp, updatedAt: stamp, syncState: 'synced' }],
    fields: [{ id: 'field-1', propertyId: 'property-1', name: 'Talhão Norte', areaHa: 28.5, rowSpacingM: 0.45, createdAt: stamp, updatedAt: stamp, syncState: 'synced' }],
    evaluations: [{ id: evaluationId, visitId, clientId: 'client-1', propertyId: 'property-1', fieldId: 'field-1', culture: 'Soja', phenologicalStage: 'V6', nodeCount: 6, noduleCount: 14, observations: photoCount === 10 ? `${observation} ${observation} ${observation}` : observation, rowSpacingM: 0.45, standMeasurements: [{ plants: 12, lengthM: 1 }, { plants: 11, lengthM: 1 }], standPlantsPerMeter: 11.5, standPlantsPerHectare: 255556, standSource: 'calculated', createdAt: stamp, updatedAt: stamp, syncState: 'synced' }],
    photos: Array.from({ length: photoCount }, (_, position) => ({ id: `photo-${photoCount}-${position}`, evaluationId, filename: `registro-${position + 1}.png`, mimeType: 'image/png', caption: longCaptions && position % 2 ? longCaption : `Registro ${position + 1}: condição observada no talhão.`, position, blob: imageBlob, createdAt: stamp, updatedAt: stamp, syncState: 'synced' }))
  }
}

await mkdir(resolve(root, 'tmp', 'pdfs'), { recursive: true })
await mkdir(resolve(root, 'output', 'pdf'), { recursive: true })
for (const amount of [1, 2, 3, 4, 6, 10]) {
  const blob = await createVisitPdf(contextFor(amount))
  await writeFile(resolve(root, 'tmp', 'pdfs', `layout-${amount}-fotos.pdf`), Buffer.from(await blob.arrayBuffer()))
}
const shortSix = await createVisitPdf(contextFor(6, false))
await writeFile(resolve(root, 'tmp', 'pdfs', 'layout-6-fotos-legendas-curtas.pdf'), Buffer.from(await shortSix.arrayBuffer()))
await copyFile(resolve(root, 'tmp', 'pdfs', 'layout-10-fotos.pdf'), resolve(root, 'output', 'pdf', 'engedrop-relatorio-tecnico-exemplo.pdf'))
console.log('PDF visual test set written to tmp/pdfs; final example written to output/pdf.')
