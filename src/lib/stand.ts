import type { StandMeasurement } from '../types'

export interface StandResult {
  averagePlantsPerMeter?: number
  plantsPerHectare?: number
  repetitions: number
  totalLengthM: number
}

/** Plantas/ha = plantas/m × 10.000 ÷ espaçamento em metros. */
export function calculateStand(measurements: StandMeasurement[], rowSpacingM?: number): StandResult {
  const valid = measurements.filter(item => item.lengthM > 0 && item.plants >= 0)
  if (!valid.length) return { repetitions: 0, totalLengthM: 0 }
  const totalLengthM = valid.reduce((sum, item) => sum + item.lengthM, 0)
  const totalPlants = valid.reduce((sum, item) => sum + item.plants, 0)
  const averagePlantsPerMeter = totalLengthM ? totalPlants / totalLengthM : undefined
  return {
    repetitions: valid.length,
    totalLengthM,
    averagePlantsPerMeter,
    plantsPerHectare: averagePlantsPerMeter && rowSpacingM && rowSpacingM > 0
      ? averagePlantsPerMeter * 10000 / rowSpacingM
      : undefined
  }
}
