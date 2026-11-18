import { useEffect, useRef, useState } from 'react'

export interface JoyVector {
  /** 归一化位移（超出盘面已裁剪），-1~1 */
  x: number
  y: number
  /** 归一化长度 0~1（超出裁剪为 1），死区判断用 */
  len: number
}

/**
 * 高性能虚拟摇杆（相对起点模型，三个摇杆游戏共用）：
 *
 * 卡顿的三个根源都在这里解决：
 * 1. 原生 Pointer 监听 + setPointerCapture，绕过 React 合成事件系统的分发开销
 * 2. pointermove 里只「记录最新坐标」——换算（含 getBoundingClientRect）与滑块 DOM
 *    写入统一收敛到 rAF 每帧一次：120Hz 触屏一帧两条事件也不再重复算两遍，
 *    输入与画面同帧生效，连续拖动变向不卡顿
 * 3. 盘面元素用回调 ref 挂监听：全屏切换时元素重挂载也能自动重新接上
 *
 * 消费方式：游戏主循环每帧读 vectorRef.current（或用 onChange 回调写自己的输入状态）。
 */
export function useJoystick(opts: {
  /** 活动期间每帧回调一次；松手时回调一次零向量 */
  onChange?: (v: JoyVector) => void
  /** 按下时的附加动作（如确保音频上下文已创建） */
  onPress?: () => void
  /** 滑块最大偏移 = 盘半径 × rangeRatio（默认 0.62） */
  rangeRatio?: number
} = {}) {
  /** 盘面元素的回调 ref：条件渲染（如仅全屏显示）下重挂载自动重接监听 */
  const [baseEl, setBaseEl] = useState<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const vectorRef = useRef<JoyVector>({ x: 0, y: 0, len: 0 })
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!baseEl) return
    let active = false
    let pointerId = -1
    let ox = 0
    let oy = 0
    let px = 0
    let py = 0
    let range = 1
    let raf = 0

    /** 换算 + 写滑块 + 通知消费者：只在 rAF 里跑，每帧最多一次 */
    const apply = () => {
      let dx = px - ox
      let dy = py - oy
      const raw = Math.hypot(dx, dy)
      if (raw > range) {
        dx = (dx / raw) * range
        dy = (dy / raw) * range
      }
      vectorRef.current = { x: dx / range, y: dy / range, len: Math.min(1, raw / range) }
      if (thumbRef.current) thumbRef.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
      optsRef.current.onChange?.(vectorRef.current)
    }
    const tick = () => {
      if (!active) return
      apply()
      raf = requestAnimationFrame(tick)
    }

    const down = (e: PointerEvent) => {
      if (active) return
      e.preventDefault()
      active = true
      pointerId = e.pointerId
      const rect = baseEl.getBoundingClientRect() // 只在按下时读一次布局
      range = Math.max(1, (rect.width / 2) * (optsRef.current.rangeRatio ?? 0.62))
      ox = px = e.clientX
      oy = py = e.clientY
      optsRef.current.onPress?.()
      try {
        baseEl.setPointerCapture(e.pointerId)
      } catch {
        // 个别浏览器对已释放指针抛错，忽略即可
      }
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }
    const move = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return
      e.preventDefault()
      px = e.clientX
      py = e.clientY
    }
    const release = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return
      active = false
      cancelAnimationFrame(raf)
      vectorRef.current = { x: 0, y: 0, len: 0 }
      if (thumbRef.current) thumbRef.current.style.transform = 'translate(0px, 0px)'
      optsRef.current.onChange?.({ x: 0, y: 0, len: 0 })
    }

    baseEl.addEventListener('pointerdown', down, { passive: false })
    baseEl.addEventListener('pointermove', move, { passive: false })
    baseEl.addEventListener('pointerup', release)
    baseEl.addEventListener('pointercancel', release)
    return () => {
      baseEl.removeEventListener('pointerdown', down)
      baseEl.removeEventListener('pointermove', move)
      baseEl.removeEventListener('pointerup', release)
      baseEl.removeEventListener('pointercancel', release)
      cancelAnimationFrame(raf)
    }
  }, [baseEl])

  return { setBaseEl, thumbRef, vectorRef }
}

/**
 * 四向换算 + 斜向滞回：四向游戏（坦克等）在对角线附近 |dx|≈|dy| 时，
 * 朴素的「比大小」会每帧翻转方向、走一步顿一步；这里记住当前朝向，
 * 只有另一轴分量超过当前轴 1.3 倍才切换——变向依然即时，但不再抖动。
 *
 * 方向约定 0上 1右 2下 3左；prev 为当前朝向（-1 = 尚未选定）。
 */
export function dirFromVector(x: number, y: number, prev: number): number {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const horizontal = x >= 0 ? 1 : 3
  const vertical = y >= 0 ? 2 : 0
  if (prev === 1 || prev === 3) return ay > ax * 1.3 ? vertical : horizontal
  if (prev === 0 || prev === 2) return ax > ay * 1.3 ? horizontal : vertical
  return ax > ay ? horizontal : vertical
}
