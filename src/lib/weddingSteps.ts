/**
 * 备婚流程步骤：从「确定心意」到「结完婚」，一共 16 个节点。
 *
 * 这是内置模板，步骤本身不支持增删（避免两个人把流程改得对不上），
 * 情侣能改的只有「哪一步做完了」和「哪条待办勾好了」，进度双方实时同步。
 */

/** 待办项归属：todo = 要做的事，prepare = 要准备的东西 */
export type WeddingItemKind = 'todo' | 'prepare'

export interface WeddingStep {
  id: string
  emoji: string
  title: string
  /** 这一步大概在什么时候做，给个时间感 */
  timing: string
  /** 要做的事（可勾选） */
  todo: string[]
  /** 要准备的东西（可勾选） */
  prepare: string[]
}

export const WEDDING_STEPS: WeddingStep[] = [
  {
    id: 'proposal',
    emoji: '💍',
    title: '求婚与确定心意',
    timing: '一切的开始',
    todo: ['认真聊一次「我们到底要不要结婚」', '对齐彼此对婚期的预期', '先和各自父母通个气'],
    prepare: ['一颗确定的心', '想好怎么开口', '对婚后生活的大致想法'],
  },
  {
    id: 'meet-parents',
    emoji: '🤝',
    title: '见双方父母',
    timing: '婚前 12 个月',
    todo: ['先去一方家里正式拜访', '再去另一方家里', '商量两家人正式见面的时间'],
    prepare: ['见面礼（补品 / 水果 / 特产）', '自己的基本情况', '可能被问到的问题的答案'],
  },
  {
    id: 'betrothal',
    emoji: '💰',
    title: '提亲与谈彩礼',
    timing: '婚前 10 个月',
    todo: ['两家人正式坐下来谈一次', '谈彩礼、嫁妆和各自承担的部分', '把谈定的结果留个书面记录'],
    prepare: ['双方家庭的心理预期', '谁来当中间人', '自己能接受的底线与让步空间'],
  },
  {
    id: 'date',
    emoji: '📅',
    title: '定婚期与择日',
    timing: '婚前 8-10 个月',
    todo: ['圈出双方都方便的时间段', '参考长辈意见或黄历择日', '避开旺季涨价和亲友档期冲突'],
    prepare: ['双方的工作与假期安排', '重要亲友的时间', '备选的两个日期'],
  },
  {
    id: 'budget',
    emoji: '🧮',
    title: '定预算与分工',
    timing: '婚前 8 个月',
    todo: ['列出所有可能花钱的项目', '确定总预算和两家分摊比例', '开一张备婚专用的记账表'],
    prepare: ['各自的存款情况', '双方父母愿意支持多少', '哪些项目可以省'],
  },
  {
    id: 'register',
    emoji: '💒',
    title: '领证',
    timing: '婚前 6 个月或更早',
    todo: ['挑一个对你们有意义的日子', '去一方户籍所在地的民政局', '领完证拍张合照纪念一下'],
    prepare: ['双方身份证、户口本', '3 张 2 寸近期半身免冠合影', '离婚 / 丧偶证明（如适用）'],
  },
  {
    id: 'venue',
    emoji: '🏨',
    title: '订婚礼场地',
    timing: '婚前 6-8 个月',
    todo: ['确定办几场、在哪几座城市办', '实地看 3-5 家场地对比', '签合同、交定金'],
    prepare: ['预估的桌数与人数', '场地预算', '交通与住宿是否方便'],
  },
  {
    id: 'photo',
    emoji: '📸',
    title: '拍婚纱照',
    timing: '婚前 4-6 个月',
    todo: ['选风格和拍摄地（影楼 / 旅拍）', '定下拍摄档期', '拍摄并选片'],
    prepare: ['几套自己的衣服', '隐形内衣、胸贴、浅色鞋', '喜欢的样片参考'],
  },
  {
    id: 'dress',
    emoji: '👗',
    title: '挑婚纱与礼服',
    timing: '婚前 3-4 个月',
    todo: ['试穿并定下主纱与敬酒服', '给新郎定西装', '安排伴娘伴郎的服装'],
    prepare: ['准确的身材尺寸', '婚礼场地的风格参考', '预留改衣的时间'],
  },
  {
    id: 'rings',
    emoji: '💎',
    title: '买三金五金与对戒',
    timing: '婚前 2-3 个月',
    todo: ['逛几家对比金价与款式', '定下三金 / 五金和对戒', '留好发票与证书'],
    prepare: ['这一项的预算', '双方的戒指手寸', '长辈对样式的意见'],
  },
  {
    id: 'vendors',
    emoji: '🎤',
    title: '定婚庆与四大金刚',
    timing: '婚前 3-5 个月',
    todo: ['定司仪、摄影、摄像、化妆', '和婚庆确认布置方案', '把所有服务写进合同'],
    prepare: ['婚礼风格参考图', '各环节的音乐清单', '当天的流程表'],
  },
  {
    id: 'invite',
    emoji: '💌',
    title: '发请柬与统计人数',
    timing: '婚前 1-2 个月',
    todo: ['列宾客名单、分桌', '发电子 / 纸质请柬', '回收人数、安排座位'],
    prepare: ['双方亲友的联系方式', '酒店的桌数上限', '回门 / 答谢宴的名单'],
  },
  {
    id: 'rehearsal',
    emoji: '🎀',
    title: '彩排与婚前准备',
    timing: '婚前 1 周',
    todo: ['完整走一遍婚礼流程', '确认所有供应商的到场时间', '布置婚房、备好红包与伴手礼'],
    prepare: ['当天的物品清单', '红包、喜糖、伴手礼', '应急包（针线、别针、创可贴）'],
  },
  {
    id: 'wedding-day',
    emoji: '🎊',
    title: '婚礼当天',
    timing: '最重要的那一天',
    todo: ['按流程走完接亲、仪式、敬酒', '留十分钟给两个人单独待一会儿', '当天拍一张只有你们的合照'],
    prepare: ['结婚证与戒指', '仪式上想说的话', '一份好心情'],
  },
  {
    id: 'honeymoon',
    emoji: '✈️',
    title: '蜜月旅行',
    timing: '婚后 1 个月内',
    todo: ['定目的地和出行时间', '订机票酒店、办签证', '把工作和家里的事交代好'],
    prepare: ['护照与签证', '旅行保险', '行李与常用药品'],
  },
  {
    id: 'after',
    emoji: '🏠',
    title: '回门与婚后生活',
    timing: '婚礼之后',
    todo: ['办回门 / 答谢宴', '整理婚礼的照片与视频', '结清礼金和备婚账目'],
    prepare: ['回门礼', '婚礼影像的备份', '一张小家的计划表'],
  },
]

/** 待办项的存储 key：步骤 id + 归属 + 序号，改文案不会错位（靠序号） */
export const weddingItemKey = (stepId: string, kind: WeddingItemKind, index: number): string =>
  `${stepId}|${kind}|${index}`

export const WEDDING_TOTAL = WEDDING_STEPS.length
