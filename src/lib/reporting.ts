import { jsPDF } from 'jspdf'
import type { Client, Evaluation, Field, Property, Visit, VisitPhoto } from '../types'
import { calculateStand } from './stand'
import { dateLabel, decimal } from './utils'

export interface ReportContext {
  visit: Visit
  client: Client
  properties: Property[]
  fields: Field[]
  evaluations: Evaluation[]
  photos: VisitPhoto[]
}

const fieldFor = (context: ReportContext, evaluation: Evaluation) => context.fields.find(item => item.id === evaluation.fieldId)
const propertyFor = (context: ReportContext, evaluation: Evaluation) => context.properties.find(item => item.id === evaluation.propertyId)

function evaluationLines(context: ReportContext, evaluation: Evaluation) {
  const field = fieldFor(context, evaluation)
  const property = propertyFor(context, evaluation)
  const calculation = calculateStand(evaluation.standMeasurements, evaluation.rowSpacingM)
  const lines = [
    `Talhão: ${field?.name ?? 'Não informado'}`,
    property ? `Propriedade: ${property.name}${property.city ? ` — ${property.city}${property.state ? `/${property.state}` : ''}` : ''}` : '',
    evaluation.culture ? `Cultura: ${evaluation.culture}` : '',
    evaluation.phenologicalStage ? `Estádio: ${evaluation.phenologicalStage}` : '',
    evaluation.phenologicalCustom ? `Detalhe do estádio: ${evaluation.phenologicalCustom}` : '',
    evaluation.rowSpacingM ? `Espaçamento: ${decimal(evaluation.rowSpacingM, 3)} m` : '',
    evaluation.standPlantsPerMeter !== undefined ? `Stand: ${decimal(evaluation.standPlantsPerMeter)} plantas/m` : (calculation.averagePlantsPerMeter !== undefined ? `Stand: ${decimal(calculation.averagePlantsPerMeter)} plantas/m` : ''),
    evaluation.standPlantsPerHectare !== undefined ? `População: ${decimal(evaluation.standPlantsPerHectare, 0)} plantas/ha${evaluation.standSource === 'manual' ? ' (manual)' : ''}` : (calculation.plantsPerHectare ? `População: ${decimal(calculation.plantsPerHectare, 0)} plantas/ha` : ''),
    evaluation.nodeCount !== undefined ? `Número de nós: ${decimal(evaluation.nodeCount)}` : '',
    evaluation.noduleCount !== undefined ? `Número de nódulos: ${decimal(evaluation.noduleCount)}` : '',
    evaluation.observations ? `Observações: ${evaluation.observations}` : ''
  ]
  return lines.filter(Boolean)
}

export function buildWhatsAppReport(context: ReportContext) {
  const header = [
    '*ENGEDROP | VISITA TÉCNICA*',
    `*Cliente:* ${context.client.name}`,
    `*Data:* ${dateLabel(context.visit.date)}`,
    context.visit.season ? `*Safra:* ${context.visit.season}` : '',
    context.visit.technicalManager ? `*Responsável:* ${context.visit.technicalManager}` : ''
  ].filter(Boolean)
  const evaluations = context.evaluations.map((evaluation, index) => {
    const field = fieldFor(context, evaluation)
    const property = propertyFor(context, evaluation)
    const lines = evaluationLines(context, evaluation).filter(line => !line.startsWith('Talhão:') && !line.startsWith('Propriedade:'))
    return [`*${index + 1}. ${field?.name ?? 'Avaliação'}*`, property ? `_${property.name}_` : '', ...lines].filter(Boolean).join('\n')
  })
  return [...header, '', ...evaluations, context.visit.notes ? `\n*Observações da visita:* ${context.visit.notes}` : ''].filter(Boolean).join('\n')
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

async function bundledLogoDataUrl() {
  const response = await fetch(`${import.meta.env.BASE_URL}engedrop-logo-white.png`)
  if (!response.ok) throw new Error('Logomarca indisponível')
  return blobToDataUrl(await response.blob())
}

async function imageDimensions(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url
    })
    return { width: image.naturalWidth || 4, height: image.naturalHeight || 3 }
  } finally { URL.revokeObjectURL(url) }
}

type PdfColor = [number, number, number]
type PreparedPhoto = { photo: VisitPhoto; dataUrl: string; ratio: number; caption: string }

const green: PdfColor = [8, 116, 67]
const darkGreen: PdfColor = [4, 86, 49]
const ink: PdfColor = [24, 38, 52]
const muted: PdfColor = [91, 105, 114]
const line: PdfColor = [222, 231, 225]
const paleGreen: PdfColor = [240, 248, 243]
const margin = 15
const footerSpace = 17

function photoRows(photos: PreparedPhoto[]): PreparedPhoto[][] {
  if (photos.length <= 2) return [photos]
  if (photos.length === 3) return [photos.slice(0, 2), photos.slice(2)]
  const rows: PreparedPhoto[][] = []
  let cursor = 0
  while (photos.length - cursor >= 4) {
    rows.push(photos.slice(cursor, cursor + 2), photos.slice(cursor + 2, cursor + 4))
    cursor += 4
  }
  const rest = photos.slice(cursor)
  if (rest.length) rows.push(...photoRows(rest))
  return rows
}

async function preparePhotos(photos: VisitPhoto[]): Promise<PreparedPhoto[]> {
  const prepared: PreparedPhoto[] = []
  for (const photo of photos) {
    if (!photo.blob) continue
    try {
      const [dataUrl, dimensions] = await Promise.all([blobToDataUrl(photo.blob), imageDimensions(photo.blob)])
      prepared.push({ photo, dataUrl, ratio: dimensions.width / dimensions.height, caption: photo.caption?.trim() || 'Registro fotográfico' })
    } catch { /* an unreadable local file must not prevent the technical report */ }
  }
  return prepared
}

export async function createVisitPdf(context: ReportContext): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const company = import.meta.env.VITE_COMPANY_NAME || 'Engedrop'
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - footerSpace
  let logo: string | undefined
  try { logo = await bundledLogoDataUrl() } catch { /* the textual brand is a safe offline fallback */ }
  let y = 0

  const setText = (size = 9, color: PdfColor = ink, weight: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', weight); doc.setFontSize(size); doc.setTextColor(...color)
  }
  const drawLogo = (top: number, compact = false) => {
    if (!logo) return
    const width = compact ? 38 : 48
    const height = compact ? 13 : 16
    const x = pageWidth - margin - width
    doc.setFillColor(255, 255, 255); doc.roundedRect(x - 2, top - 1, width + 4, height + 2, 2, 2, 'F')
    doc.addImage(logo, 'PNG', x, top, width, height, undefined, 'FAST')
  }
  const drawHeader = (compact = false) => {
    const height = compact ? 24 : 42
    doc.setFillColor(...green); doc.rect(0, 0, pageWidth, height, 'F')
    doc.setFillColor(...darkGreen); doc.rect(0, height - 3, pageWidth, 3, 'F')
    if (compact) {
      setText(10, [255, 255, 255], 'bold'); doc.text('RELATÓRIO DE VISITA TÉCNICA', margin, 11)
      setText(7.5, [224, 246, 234]); doc.text(`${company.toUpperCase()} - VISITA DE CAMPO`, margin, 17)
      setText(8, [255, 255, 255], 'bold'); doc.text(company.toUpperCase(), pageWidth - margin, 14, { align: 'right' }); y = 34
      return
    }
    setText(18, [255, 255, 255], 'bold'); doc.text('RELATÓRIO DE', margin, 15)
    setText(18, [255, 255, 255], 'bold'); doc.text('VISITA TÉCNICA', margin, 23)
    setText(8.5, [225, 246, 235]); doc.text(`${company.toUpperCase()} - ACOMPANHAMENTO AGRONÔMICO`, margin, 31)
    drawLogo(10); y = 51
  }
  const newPage = () => {
    doc.addPage()
    // Explicitly select the fresh page: this matters for some jsPDF renderers
    // after image-heavy pages, where addPage alone can retain the prior page.
    doc.setPage(doc.getNumberOfPages())
    drawHeader(true)
  }
  const ensure = (height: number) => { if (y + height > bottom) newPage() }
  const split = (value: string, width: number, size = 8.5) => { setText(size); return doc.splitTextToSize(value, width) as string[] }
  const section = (title: string, subtitle?: string, reserve = 0) => {
    const height = subtitle ? 14 : 10
    ensure(height + reserve)
    setText(10.5, green, 'bold'); doc.text(title.toUpperCase(), margin, y)
    doc.setDrawColor(...green); doc.setLineWidth(0.55); doc.line(margin, y + 3.2, margin + 17, y + 3.2)
    if (subtitle) { setText(7.5, muted); doc.text(subtitle, margin, y + 7) }
    y += height
  }
  const card = (x: number, top: number, width: number, height: number, fill: PdfColor = [255, 255, 255]) => {
    doc.setFillColor(...fill); doc.setDrawColor(...line); doc.setLineWidth(0.25)
    doc.roundedRect(x, top, width, height, 2.5, 2.5, 'FD')
  }
  const infoBlock = (items: Array<{ label: string; value: string }>) => {
    const columns = 3
    const gap = 3
    const cellWidth = (contentWidth - gap * (columns - 1)) / columns
    const rows = Math.ceil(items.length / columns)
    const height = rows * 18 + 5
    ensure(height)
    card(margin, y, contentWidth, height, paleGreen)
    items.forEach((item, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = margin + column * (cellWidth + gap) + 4
      const top = y + row * 18 + 5
      setText(6.5, muted, 'bold'); doc.text(item.label.toUpperCase(), x, top)
      setText(9, ink, 'bold'); const value = split(item.value || 'Não informado', cellWidth - 7, 9)
      doc.text(value.slice(0, 2), x, top + 5)
    })
    y += height + 6
  }
  const metrics = (evaluation: Evaluation) => {
    const calculation = calculateStand(evaluation.standMeasurements, evaluation.rowSpacingM)
    const stand = evaluation.standPlantsPerMeter ?? calculation.averagePlantsPerMeter
    const population = evaluation.standPlantsPerHectare ?? calculation.plantsPerHectare
    const items = [
      ['Cultura', evaluation.culture || 'Não informado'],
      ['Talhão', fieldFor(context, evaluation)?.name || 'Não informado'],
      ['Estádio fenológico', evaluation.phenologicalStage || evaluation.phenologicalCustom || 'Não informado'],
      ['Espaçamento', evaluation.rowSpacingM ? `${decimal(evaluation.rowSpacingM, 3)} m` : 'Não informado'],
      ['Stand', stand !== undefined ? `${decimal(stand)} plantas/m` : 'Não informado'],
      ['População', population !== undefined ? `${decimal(population, 0)} plantas/ha` : 'Não informado'],
      ['Número de nós', evaluation.nodeCount !== undefined ? decimal(evaluation.nodeCount) : 'Não informado'],
      ['Número de nódulos', evaluation.noduleCount !== undefined ? decimal(evaluation.noduleCount) : 'Não informado']
    ]
    const columns = 4
    const gap = 3
    const cellWidth = (contentWidth - gap * (columns - 1)) / columns
    const cellHeight = 20
    ensure(cellHeight * 2 + gap + 2)
    for (const [index, item] of items.entries()) {
      const col = index % columns
      const row = Math.floor(index / columns)
      const x = margin + col * (cellWidth + gap)
      const top = y + row * (cellHeight + gap)
      card(x, top, cellWidth, cellHeight, index < 4 ? [247, 251, 248] : [255, 255, 255])
      setText(6.4, muted, 'bold'); doc.text(item[0].toUpperCase(), x + 3, top + 6)
      setText(8.6, ink, 'bold'); doc.text(split(item[1], cellWidth - 6, 8.6).slice(0, 2), x + 3, top + 12)
    }
    y += cellHeight * 2 + gap + 7
  }
  const noteBlock = (title: string, value?: string) => {
    if (!value?.trim()) return
    const lines = split(value.trim(), contentWidth - 10, 8.6)
    let remaining = [...lines]
    let first = true
    while (remaining.length) {
      const available = Math.max(2, Math.floor((bottom - y - 11) / 4.3))
      if (y + 18 > bottom) newPage()
      const chunk = remaining.splice(0, Math.min(available, remaining.length))
      const height = chunk.length * 4.3 + 11
      ensure(height)
      card(margin, y, contentWidth, height, [250, 252, 251])
      setText(7, green, 'bold'); doc.text(first ? title.toUpperCase() : `${title.toUpperCase()} (CONTINUAÇÃO)`, margin + 5, y + 6)
      setText(8.6, ink); doc.text(chunk, margin + 5, y + 12)
      y += height + 6
      first = false
    }
  }
  const photoRowLayout = (row: PreparedPhoto[]) => {
    const imageHeight = row.length === 1 ? 82 : 60
    const gap = 4
    const itemWidth = (contentWidth - gap * (row.length - 1)) / row.length
    const captions = row.map(item => split(item.caption, itemWidth - 6, 7.4))
    const captionHeight = Math.max(...captions.map(lines => Math.max(1, lines.length))) * 3.7 + 7
    return { imageHeight, gap, itemWidth, captions, totalHeight: imageHeight + captionHeight + 4 }
  }
  const drawPhotoRow = (row: PreparedPhoto[], startIndex: number) => {
    const { imageHeight, gap, itemWidth, captions, totalHeight } = photoRowLayout(row)
    // Keep a safety gutter before the institutional footer. It also avoids a
    // WebKit/jsPDF edge case that can split the final caption onto a new page.
    ensure(totalHeight + 8)
    row.forEach((item, column) => {
      const x = margin + column * (itemWidth + gap)
      card(x, y, itemWidth, totalHeight, [255, 255, 255])
      const imageX = x + 2
      const imageY = y + 2
      const maxWidth = itemWidth - 4
      const maxHeight = imageHeight - 4
      let width = maxWidth
      let height = width / item.ratio
      if (height > maxHeight) { height = maxHeight; width = height * item.ratio }
      const drawX = imageX + (maxWidth - width) / 2
      const drawY = imageY + (maxHeight - height) / 2
      doc.saveGraphicsState()
      try { doc.addImage(item.dataUrl, item.photo.mimeType.toLowerCase().includes('png') ? 'PNG' : 'JPEG', drawX, drawY, width, height, undefined, 'FAST') } catch { /* leave the labelled frame visible */ }
      finally { doc.restoreGraphicsState() }
      setText(6.5, muted, 'bold'); doc.text(`FOTO ${String(startIndex + column + 1).padStart(2, '0')}`, x + 3, y + imageHeight + 4)
      setText(7.4, ink); doc.text(captions[column], x + 3, y + imageHeight + 8)
    })
    y += totalHeight + 5
  }

  drawHeader()
  const firstEvaluation = context.evaluations[0]
  const firstProperty = firstEvaluation ? propertyFor(context, firstEvaluation) : undefined
  section('Identificação da visita', 'Dados gerais do acompanhamento')
  infoBlock([
    { label: 'Cliente', value: context.client.name },
    { label: 'Propriedade', value: firstProperty?.name || 'Não informado' },
    { label: 'Município', value: [firstProperty?.city, firstProperty?.state].filter(Boolean).join(' / ') || 'Não informado' },
    { label: 'Data da visita', value: dateLabel(context.visit.date) },
    { label: 'Responsável técnico', value: context.visit.technicalManager || 'Não informado' },
    { label: 'Safra', value: context.visit.season || 'Não informada' }
  ])
  noteBlock('Observações gerais', context.visit.notes)

  for (const [index, evaluation] of context.evaluations.entries()) {
    const field = fieldFor(context, evaluation)
    const property = propertyFor(context, evaluation)
    section(`Avaliação ${String(index + 1).padStart(2, '0')}`, `${field?.name || 'Talhão não informado'}${property ? ` - ${property.name}` : ''}`)
    metrics(evaluation)
    noteBlock('Observações técnicas', evaluation.observations)
    const photos = await preparePhotos(context.photos.filter(photo => photo.evaluationId === evaluation.id).sort((a, b) => a.position - b.position))
    if (photos.length) {
      const rows = photoRows(photos)
      section('Registro fotográfico', `${photos.length} fotografia${photos.length === 1 ? '' : 's'} vinculada${photos.length === 1 ? '' : 's'} à avaliação`, photoRowLayout(rows[0]).totalHeight)
      let count = 0
      for (const row of rows) { drawPhotoRow(row, count); count += row.length }
    }
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    // Repaint the compact header on continuation pages in the final pass.
    // This keeps the institutional heading consistent even when jsPDF creates
    // a page during a dynamic overflow calculation.
    if (page > 1) drawHeader(true)
    doc.setDrawColor(...line); doc.setLineWidth(0.3); doc.line(margin, pageHeight - 12.5, pageWidth - margin, pageHeight - 12.5)
    setText(7.2, muted, 'bold')
    doc.text(`${company.toUpperCase()} - RELATÓRIO TÉCNICO - PÁGINA ${page}/${pages}`, margin, pageHeight - 7.5)
    setText(7.2, muted); doc.text('Documento gerado pelo Engedrop Campo', pageWidth - margin, pageHeight - 7.5, { align: 'right' })
  }
  return doc.output('blob')
}
