import { useEffect, useRef, useState } from 'react'

/**
 * 同图两阶段 blur-up 图片：进入视口前不加载，离屏约 300px 才开始挂 src；
 * 加载前显示同色调模糊占位，原图 onLoad 后从模糊慢慢变清晰同时从 1.05 缩回 1。
 * 容器用固定纵横比（aspect），图片框尺寸提前固定，整页不跳动不闪白。
 * 失败时沿用「先换兜底地址、再失败显示占位」的两段式兜底（AboutPage 范式）。
 */
export default function BlurImage({
  src,
  alt,
  aspect = 'aspect-[4/3]',
  className = '',
  fallbackSrc,
}: {
  src: string
  alt: string
  /** Tailwind 纵横比类，默认 4:3；传空串则由外部容器决定高度 */
  aspect?: string
  className?: string
  /** 加载失败时的兜底地址（可选），再失败显示占位图标 */
  fallbackSrc?: string
}) {
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={`overflow-hidden bg-slate-100 ${aspect} ${className}`}>
      {inView && !failed && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            const img = e.currentTarget
            if (fallbackSrc && !img.dataset.fallback) {
              img.dataset.fallback = '1'
              img.src = fallbackSrc
            } else {
              setFailed(true)
            }
          }}
          className={`h-full w-full object-cover transition-[filter,transform,opacity] duration-700 ease-out ${
            loaded ? 'scale-100 opacity-100 blur-0' : 'scale-105 opacity-80 blur-md'
          }`}
        />
      )}
      {failed && <div className="flex h-full w-full items-center justify-center text-2xl opacity-50">🖼️</div>}
    </div>
  )
}
