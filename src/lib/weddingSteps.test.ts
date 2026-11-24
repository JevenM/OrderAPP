import { describe, expect, it } from 'vitest'
import { WEDDING_STEPS, WEDDING_TOTAL, cloneWeddingSteps, weddingItemKey } from './weddingSteps'

describe('备婚流程模板', () => {
  it('总量与数组长度一致', () => {
    expect(WEDDING_TOTAL).toBe(WEDDING_STEPS.length)
  })

  it('步骤 id 唯一', () => {
    const ids = WEDDING_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('关键步骤顺序符合时间线：订场地早于领证，婚庆早于挑婚纱', () => {
    const idx = (id: string) => WEDDING_STEPS.findIndex((s) => s.id === id)
    expect(idx('venue')).toBeLessThan(idx('register'))
    expect(idx('vendors')).toBeLessThan(idx('dress'))
    expect(idx('dress')).toBeLessThan(idx('rings'))
  })

  it('每一步都有 emoji / 标题 / 待办', () => {
    for (const s of WEDDING_STEPS) {
      expect(s.emoji).toBeTruthy()
      expect(s.title).toBeTruthy()
      expect(s.todo.length + s.prepare.length).toBeGreaterThan(0)
    }
  })

  it('cloneWeddingSteps 深拷贝，改副本不影响模板', () => {
    const copy = cloneWeddingSteps()
    copy[0].title = '改动'
    copy[0].todo[0].text = '改动'
    expect(WEDDING_STEPS[0].title).not.toBe('改动')
    expect(WEDDING_STEPS[0].todo[0].text).not.toBe('改动')
  })

  it('weddingItemKey 格式稳定', () => {
    expect(weddingItemKey('venue', 'todo', '0')).toBe('venue|todo|0')
  })
})
