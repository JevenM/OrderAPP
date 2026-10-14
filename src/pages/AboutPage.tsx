import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'

export default function AboutPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText('感谢您的打赏支持！')
      setCopied(true)
      toast.show('已复制支持寄语，谢谢你！')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.show('请长按保存二维码进行扫码支持', 'err')
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-3 py-4 sm:py-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="btn-ghost -ml-2 text-sm text-slate-500 hover:text-slate-700"
          onClick={() => navigate(-1)}
        >
          ← 返回
        </button>
        <span className="chip border-brand-200 bg-brand-50 text-xs text-brand-600">关于我们</span>
      </div>

      <div className="card space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-500 to-rose-400 text-3xl shadow-md">
          💕
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">点餐 & 专属情侣空间</h2>
          <p className="mt-1 text-xs text-slate-400">OrderAPP · 记录点滴，温暖相伴</p>
        </div>
        <p className="rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
          一个专为两人打造的专属日常空间，集众多互动功能于一体。
        </p>
      </div>

      {/* 支付宝赞赏卡片 */}
      <div className="card space-y-4 border-amber-200/80 bg-gradient-to-b from-white to-amber-50/40 text-center shadow-sm">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-800">☕ 打赏支持开发者</h3>
          <p className="text-xs text-slate-500">如果这个应用给你带来了甜蜜，欢迎支持我继续迭代！</p>
        </div>

        <div className="mx-auto max-w-[260px] overflow-hidden rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-md">
          <img
            src={`${import.meta.env.BASE_URL}alipay-qr.jpg`}
            alt="支付宝赞赏二维码"
            className="aspect-square w-full object-contain"
            onError={(event) => {
              // 兜底：jpg 不在时退回内置的 svg 占位码
              const img = event.currentTarget
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1'
                img.src = `${import.meta.env.BASE_URL}alipay-qr.svg`
              }
            }}
          />
        </div>

        <p className="text-[11px] text-slate-400">
          长按或截屏上方图片，打开支付宝扫一扫即可赞赏 🎁
        </p>

        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="btn-soft text-xs"
            onClick={handleCopy}
          >
            {copied ? '✓ 已复制寄语' : '📋 复制打赏寄语'}
          </button>
          <a
            href={`${import.meta.env.BASE_URL}alipay-qr.jpg`}
            download="alipay-qr.jpg"
            className="btn-primary text-xs"
          >
            📥 下载二维码图片
          </a>
        </div>
      </div>

      {/* <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">💡 替换真实二维码指引：</p>
        <p className="mt-1 leading-relaxed text-slate-400">
          可直接将你的支付宝收款/赞赏码图片重命名为 <code>alipay-qr.jpg</code> 放入项目 <code>public/</code> 目录下即可直接生效。
        </p>
      </div> */}
    </div>
  )
}
