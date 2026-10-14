import { Link } from 'react-router-dom'

type AdminLink = { to: string; emoji: string; title: string; desc: string; badge?: string }

/** 日常运营：点单、饮食、菜单与成员的常规管理 */
const DAILY_LINKS: AdminLink[] = [
  { to: '/admin/orders', emoji: '🧾', title: '订单管理', desc: '查看与处理所有点单' },
  { to: '/admin/meals', emoji: '🍚', title: '饮食记录', desc: '查看大家的每日打卡' },
  { to: '/admin/dishes', emoji: '📖', title: '菜单管理', desc: '增删菜品、审核新菜申请' },
  { to: '/admin/members', emoji: '👭', title: '成员管理', desc: '成员账号与邀请码' },
  { to: '/admin/feed', emoji: '📸', title: '饭圈动态管理', desc: '按日期 / 成员筛选查看、编辑与删除', badge: '批量删除 · 导出' },
]

/** 互动空间：情侣互动模块的数据管理 */
const COUPLE_LINKS: AdminLink[] = [
  { to: '/admin/couple-data', emoji: '💞', title: '互动数据管理', desc: '留言板 / 同步抉择 / 真心话 / 心愿 / 飞行棋 / 扫雷', badge: '查看 · 编辑 · 导出 · 删除' },
  { to: '/admin/couple-questions', emoji: '❓', title: '同步抉择题库', desc: '维护轻松版 / 走心版 / 深度版题目' },
  { to: '/admin/friendships', emoji: '🤝', title: '好友关系管理', desc: '配对与解除成员好友关系' },
  { to: '/admin/modules', emoji: '🧩', title: '模块管理', desc: '控制普通用户可见可用的互动模块与入口', badge: '全局 · 按成员' },
]

function LinkCard({ link }: { link: AdminLink }) {
  return (
    <Link to={link.to} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition active:scale-[0.98]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm">{link.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-700">{link.title}</span>
          {link.badge && <span className="chip shrink-0 border-brand-200 bg-brand-50 px-1.5 text-[10px] text-brand-600">{link.badge}</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">{link.desc}</span>
      </span>
      <span className="shrink-0 text-slate-300">›</span>
    </Link>
  )
}

/** 管理员总览：所有管理入口一处集结，按「日常运营 / 互动空间」分组 */
export default function AdminHome() {
  return (
    <div className="space-y-4">
      <section className="card space-y-1">
        <h2 className="font-semibold">🗂 管理总览</h2>
        <p className="text-xs text-slate-400">所有管理功能都在这里，点卡片进入对应模块。</p>
      </section>

      <section className="card space-y-3">
        <h3 className="text-sm font-semibold text-slate-500">日常运营</h3>
        <div className="space-y-2">{DAILY_LINKS.map((link) => <LinkCard key={link.to} link={link} />)}</div>
      </section>

      <section className="card space-y-3">
        <h3 className="text-sm font-semibold text-slate-500">互动空间</h3>
        <div className="space-y-2">{COUPLE_LINKS.map((link) => <LinkCard key={link.to} link={link} />)}</div>
      </section>
    </div>
  )
}
