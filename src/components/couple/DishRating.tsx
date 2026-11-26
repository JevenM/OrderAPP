/**
 * 五颗星（逐菜评分用）。
 *
 * 触控区 5 × 40px：比视觉星号大一圈，拇指点得准；
 * 用 radiogroup 语义，读屏能听懂「给可乐鸡翅打分，当前 3 星」。
 */
export function StarRow({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: number
  onChange: (rating: number) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} 星`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl leading-none transition active:scale-90 disabled:opacity-50 ${
            n <= value ? 'text-amber-400' : 'text-slate-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
