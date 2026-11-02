import { describe, expect, it } from 'vitest'
import { calculateStand } from './stand'

describe('calculateStand', () => {
  it('calcula a média ponderada pelo comprimento e converte para hectare', () => {
    const result = calculateStand([{ plants: 10, lengthM: 1 }, { plants: 24, lengthM: 2 }], 0.5)
    expect(result.averagePlantsPerMeter).toBeCloseTo(11.333, 3)
    expect(result.plantsPerHectare).toBeCloseTo(226666.67, 1)
    expect(result.repetitions).toBe(2)
  })

  it('não calcula hectare sem espaçamento', () => {
    expect(calculateStand([{ plants: 12, lengthM: 1 }]).plantsPerHectare).toBeUndefined()
  })
})
