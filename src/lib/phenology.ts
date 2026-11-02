export const soybeanStages = [
  'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'Vn',
  'R1 — início do florescimento', 'R2 — florescimento pleno', 'R3 — início da formação de vagens',
  'R4 — vagem completamente desenvolvida', 'R5.1 — início do enchimento de grãos', 'R5.2', 'R5.3', 'R5.4', 'R5.5',
  'R6 — grão cheio', 'R7.1 — início da maturação', 'R7.2 — maturação', 'R8 — maturidade plena'
]

export const cornStages = ['VE', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'Vn', 'VT', 'R1 — pendoamento', 'R2 — grão bolha-d\'água', 'R3 — grão leitoso', 'R4 — grão pastoso', 'R5 — formação de dente', 'R6 — maturidade fisiológica']

export function stagesForCulture(culture: string) {
  const normalized = culture.trim().toLowerCase()
  if (normalized === 'soja') return soybeanStages
  if (normalized === 'milho') return cornStages
  return []
}
