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

export async function createVisitPdf(context: ReportContext): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const company = import.meta.env.VITE_COMPANY_NAME || 'Engedrop'
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = 18
  const ensure = (height: number) => {
    if (y + height > pageHeight - 18) { doc.addPage(); y = 18 }
  }
  const text = (content: string, size = 10, weight: 'normal' | 'bold' = 'normal', color: [number, number, number] = [36, 52, 43]) => {
    doc.setFont('helvetica', weight); doc.setFontSize(size); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(content, pageWidth - 30)
    ensure(lines.length * (size * 0.47) + 2)
    doc.text(lines, 15, y)
    y += lines.length * (size * 0.47) + 2
  }
  doc.setFillColor(8, 116, 67); doc.roundedRect(15, 12, pageWidth - 30, 24, 4, 4, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text(company.toUpperCase(), 21, 23)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('RELATÓRIO DE VISITA TÉCNICA', 21, 30)
  y = 46
  text(`Cliente: ${context.client.name}`, 12, 'bold')
  text(`Data da visita: ${dateLabel(context.visit.date)}${context.visit.season ? `   •   Safra: ${context.visit.season}` : ''}`)
  if (context.visit.technicalManager) text(`Responsável técnico: ${context.visit.technicalManager}`)
  if (context.visit.notes) text(`Observações gerais: ${context.visit.notes}`)

  for (const [index, evaluation] of context.evaluations.entries()) {
    ensure(20)
    y += 3; doc.setDrawColor(16, 150, 88); doc.setLineWidth(0.8); doc.line(15, y, pageWidth - 15, y); y += 7
    text(`${index + 1}. ${fieldFor(context, evaluation)?.name ?? 'Avaliação'}`, 13, 'bold', [8, 116, 67])
    for (const line of evaluationLines(context, evaluation)) text(line)
    const photos = context.photos.filter(photo => photo.evaluationId === evaluation.id).sort((a, b) => a.position - b.position)
    for (const photo of photos) {
      if (!photo.blob) continue
      try {
        const dataUrl = await blobToDataUrl(photo.blob)
        ensure(65)
        const imageFormat = photo.mimeType.toLowerCase().includes('png') ? 'PNG' : 'JPEG'
        doc.addImage(dataUrl, imageFormat, 15, y, 85, 57, undefined, 'FAST')
        if (photo.caption) { doc.setTextColor(80, 90, 84); doc.setFontSize(8); doc.text(doc.splitTextToSize(photo.caption, 85), 15, y + 61) }
        y += photo.caption ? 70 : 63
      } catch { /* a report remains useful even if an image is unreadable */ }
    }
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100, 110, 104)
    doc.text(`${company} • Relatório técnico • Página ${page}/${pages}`, 15, pageHeight - 10)
  }
  return doc.output('blob')
}
