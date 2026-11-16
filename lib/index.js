// dsh-meme-wiki —— 梗wiki 查询。
//
// 为什么单独成插件：梗知识是「外界资料」，不是「智能体犯的错」。
// 一开始写进了 dsh-pipem，但那和它的定位冲突——
// pipem 是「把犯过的错记成 guard」，梗查询是另一件事，零依赖关系。

import { defineTool } from '@deepseek-ai/dsh-tools'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'

import { searchMemes, getMeme, randomMeme, renderSearch, renderEntry } from './meme.js'

export const name = 'dsh-meme-wiki'
export const inject = ['agents']

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description('总开关。关掉后不注册任何工具。'),

  cacheHours: z.number().min(0).max(720).default(24)
    .description('缓存多少小时后过期。0 = 不缓存，每次实时查。'),

  defaultLimit: z.number().min(1).max(20).default(5)
    .description('搜索默认返回几条。'),

  timeoutMs: z.number().min(1000).max(60000).default(15000)
    .description('单次请求超时（毫秒）。'),
})

const TEXT_OUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
}

/** 子智能体不装：它们去干具体活，不需要查梗。 */
function isSubagent(agent) {
  if (!agent) return false
  const h = agent?.session?.header ?? {}
  return h.origin === 'subagent'
    || h.parentSession !== undefined
    || (h.delegationDepth ?? 0) > 0
    || (agent?.options?.subagentDepth ?? 0) > 0
    || agent?.parent !== undefined
    || agent?.options?.parent !== undefined
}

function refuseSubagent(exec) {
  if (exec.agent === undefined || isSubagent(exec.agent)) {
    throw new Error('这个工具只属于主智能体')
  }
  return exec.agent.id
}

export function memeTools(dir, config) {
  const limitOf = (n) => Math.min(Math.max(n ?? config.defaultLimit, 1), 20)

  const lookup = defineTool({
    name: 'meme_lookup',
    description:
      '查中文网络梗的出处和用法，数据来自梗wiki（cnmeme.wiki，6932 条词条）。' +
      '用途是「不知道出处就不接，接了就是不诚实的卖弄」这条规矩——先查，' +
      '查得到再判断能不能用，查不到就老实说不知道。' +
      '传 query 是搜索；传 slug 是看全文。',
    parameters: {
      query: { type: 'string', description: '要查的梗或词，比如"破防"、"绝绝子"' },
      slug: { type: 'string', description: '词条 slug（从搜索结果里拿），传了就查全文' },
      limit: { type: 'integer', description: '搜索返回几条，1-20' },
    },
    output: { schema: TEXT_OUT, render: (_a, v) => [{ type: 'text', text: v.text }] },
    async execute(args, exec) {
      refuseSubagent(exec)
      if (args.slug) {
        const entry = await getMeme(dir, args.slug, { timeoutMs: config.timeoutMs, ttlMs: config.cacheHours * 3600_000 })
        return { text: renderEntry(entry) }
      }
      if (!args.query) throw new Error('query 和 slug 至少给一个')
      const res = await searchMemes(dir, args.query, {
        limit: limitOf(args.limit),
        timeoutMs: config.timeoutMs,
        ttlMs: config.cacheHours * 3600_000,
      })
      return { text: renderSearch(res, args.query) }
    },
  })

  const random = defineTool({
    name: 'meme_random',
    description: '随机拿一个中文网络梗看看。闲着时扩充知识，也用来验证这个库通不通。',
    parameters: {},
    output: { schema: TEXT_OUT, render: (_a, v) => [{ type: 'text', text: v.text }] },
    async execute(_args, exec) {
      refuseSubagent(exec)
      const item = await randomMeme(dir, { timeoutMs: config.timeoutMs })
      const full = item.slug
        ? await getMeme(dir, item.slug, { timeoutMs: config.timeoutMs, ttlMs: config.cacheHours * 3600_000 })
        : item
      return { text: renderEntry(full?.title ? full : item) }
    },
  })

  return [lookup, random]
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) {
    ctx.logger?.info?.('dsh-meme-wiki: 已禁用（enabled=false）')
    return
  }

  const dir = dshHomePath('heart')

  const install = (agent) => {
    if (isSubagent(agent)) return undefined
    return agent.ctx.inject(['systemPrompt', 'tools'], (c) => {
      for (const tool of memeTools(dir, config)) c.tools.register(tool)
    })
  }

  const installed = new Map()

  ctx.on('agent/created', async ({ agent }) => {
    const f = install(agent)
    if (f) installed.set(agent.id, f)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const f = installed.get(agent?.id)
    try { f?.dispose?.() } catch (error) {
      ctx.logger?.warn?.('dsh-meme-wiki: 卸载失败 ' + String(error))
    }
    installed.delete(agent?.id)
  })

  const agents = ctx.get('agents')
  if (!agents || typeof agents.list !== 'function') {
    throw new Error('dsh-meme-wiki: 拿不到 agents 服务，无法按会话装载；不会静默跳过')
  }
  for (const agent of agents.list()) {
    const f = install(agent)
    if (f) installed.set(agent.id, f)
  }
}
