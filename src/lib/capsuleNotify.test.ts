import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('./notify', () => ({ browserNotify: notify }))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
})

import { notifyOpenedCapsules } from './capsuleNotify'
import type { TimeCapsule } from './keepsake'

const NOW = new Date(2026, 10, 24, 12).getTime()

const capsule = (id: string, openAt: string): TimeCapsule => ({
  id, openAt, author: 'm1', authorName: '我', title: `信 ${id}`, content: '正文', createdAt: '2025-01-01T00:00:00Z',
})

describe('时光胶囊开封提醒', () => {
  beforeEach(() => {
    store.clear()
    notify.mockClear()
  })

  it('未到开封日不提醒', () => {
    expect(notifyOpenedCapsules([capsule('a', '2026-12-01')], NOW)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('刚开封的信提醒一次，之后不再重复打扰', () => {
    const list = [capsule('a', '2026-11-23')]
    expect(notifyOpenedCapsules(list, NOW)).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][1]).toContain('信 a')
    expect(notifyOpenedCapsules(list, NOW)).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('多封同时开封合并成一条提醒', () => {
    expect(notifyOpenedCapsules([capsule('a', '2026-11-23'), capsule('b', '2026-11-24')], NOW)).toBe(2)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][1]).toContain('2 封')
  })

  it('开封超过一周的旧信不再补提醒', () => {
    expect(notifyOpenedCapsules([capsule('a', '2026-01-01')], NOW)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
})
