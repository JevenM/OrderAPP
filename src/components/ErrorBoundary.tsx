import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 全局错误边界：页面渲染抛异常时显示友好回退界面，避免整页白屏。
 * 放在 App 最外层，只接住渲染期错误；事件处理里的异常仍由各业务代码的 catch 负责。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 页面渲染异常', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50/40 px-6">
        <div className="card w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-50 text-3xl">💔</div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-800">页面开小差了</h2>
            <p className="text-xs leading-relaxed text-slate-500">别担心，已帮你拦住这次异常。可以先重试，或刷新页面重新进入。</p>
          </div>
          <details className="rounded-xl bg-slate-50 p-3 text-left">
            <summary className="cursor-pointer text-2xs text-slate-400">查看错误详情</summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-2xs leading-relaxed text-slate-500">
              {error.message}
            </pre>
          </details>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 text-xs" onClick={() => this.setState({ error: null })}>
              重试
            </button>
            <button type="button" className="btn-primary flex-1 text-xs" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
        </div>
      </div>
    )
  }
}
