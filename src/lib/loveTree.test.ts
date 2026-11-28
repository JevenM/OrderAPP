import { describe, expect, it } from 'vitest'
import {
  LOVE_TREE_MAX,
  LOVE_TREE_STAGES,
  isDormantTree,
  loveTreeStageIndex,
  loveTreeVisual,
  treeSizeOf,
} from './loveTree'

describe('爱心树阶段', () => {
  it('阶段按累计浇水递进，名字与提示都齐全', () => {
    expect(LOVE_TREE_STAGES.map((s) => s.min)).toEqual([0, 2, 6, 16, 30, 50, 80, 120])
    expect(loveTreeStageIndex(0)).toBe(0)
    expect(loveTreeStageIndex(2)).toBe(1)
    expect(loveTreeStageIndex(5)).toBe(1)
    expect(loveTreeStageIndex(120)).toBe(7)
    expect(loveTreeStageIndex(999)).toBe(7)
    for (const s of LOVE_TREE_STAGES) expect(s.hint.length).toBeGreaterThan(5)
  })
})

describe('爱心树可见细节', () => {
  it('种子阶段什么都没有', () => {
    const v = loveTreeVisual(0, 0)
    expect(v.seed).toBe(true)
    expect(v.cotyledon).toBe(false)
    expect(v.branchCount).toBe(0)
    expect(v.heartCount).toBe(0)
    expect(v.flowerCount).toBe(0)
    expect(v.fruitCount).toBe(0)
  })

  it('嫩芽阶段只有子叶和芽，没有枝条和心', () => {
    const v = loveTreeVisual(1, 3)
    expect(v.seed).toBe(false)
    expect(v.cotyledon).toBe(true)
    expect(v.branchCount).toBe(0)
    expect(v.budCount).toBeGreaterThan(0)
    expect(v.heartCount).toBe(0)
  })

  it('枝条随累计浇水只增不减，末级还会分细枝', () => {
    const counts = [2, 6, 16, 30, 50, 80, 120].map((w) => loveTreeVisual(30, w).branchCount)
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(loveTreeVisual(30, 120).twigPerBranch).toBeGreaterThan(loveTreeVisual(30, 50).twigPerBranch)
    expect(treeSizeOf(120)).toBeGreaterThan(treeSizeOf(6))
  })

  it('心 → 花 → 果依次登场', () => {
    expect(loveTreeVisual(30, 16).heartCount).toBeGreaterThan(0)
    expect(loveTreeVisual(30, 16).flowerCount).toBe(0)
    expect(loveTreeVisual(30, 50).flowerCount).toBeGreaterThan(0)
    expect(loveTreeVisual(30, 50).fruitCount).toBe(0)
    expect(loveTreeVisual(30, 80).fruitCount).toBeGreaterThan(0)
  })

  it('最高阶段每根枝条都有心、花和果', () => {
    const v = loveTreeVisual(60, 120)
    expect(v.branchCount).toBe(6)
    expect(v.heartCount).toBeGreaterThanOrEqual(v.branchCount * 2)
    expect(v.flowerCount).toBeGreaterThanOrEqual(v.branchCount * 2)
    expect(v.fruitCount).toBeGreaterThanOrEqual(v.branchCount * 2)
  })

  it('断签时花和果掉光，枝干还在', () => {
    expect(isDormantTree(0, 80)).toBe(true)
    const v = loveTreeVisual(0, 80)
    expect(v.branchCount).toBeGreaterThan(0)
    expect(v.flowerCount).toBe(0)
    expect(v.fruitCount).toBe(0)
    expect(v.heartCount).toBeLessThan(loveTreeVisual(30, 80).heartCount)
  })

  it('所有数量都不越过候选点位上限', () => {
    for (const streak of [0, 1, 7, 30, 60, 999]) {
      for (const water of [0, 3, 10, 20, 40, 60, 90, 120, 999]) {
        const v = loveTreeVisual(streak, water)
        expect(v.budCount).toBeLessThanOrEqual(LOVE_TREE_MAX.buds)
        expect(v.heartCount).toBeLessThanOrEqual(LOVE_TREE_MAX.hearts)
        expect(v.flowerCount).toBeLessThanOrEqual(LOVE_TREE_MAX.flowers)
        expect(v.fruitCount).toBeLessThanOrEqual(LOVE_TREE_MAX.fruits)
      }
    }
  })
})
