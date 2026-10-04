import { useState } from 'react'

type Props = {
  /** 头像地址；为空/加载失败时回落成表情 */
  url?: string | null
  /** 兜底表情 */
  emoji?: string
  /** 边长（px） */
  size?: number
  ring?: boolean
  className?: string
  /** 额外的入场动画类，例如 animate-pop-in */
  anim?: boolean
}

/** 统一的圆形头像：有图显示图，没有就显示一个默认表情 */
export default function Avatar({ url, emoji = '👧', size = 36, ring = true, className = '', anim = true }: Props) {
  const [failed, setFailed] = useState(false)
  const show = url && !failed

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 ${
        ring ? 'ring-2 ring-white' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {show ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${anim ? 'animate-fade' : ''}`}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.52) }}>{emoji}</span>
      )}
    </span>
  )
}
