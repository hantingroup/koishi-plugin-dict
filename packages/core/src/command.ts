import type { Context } from 'koishi'
import { Argv, h, Random, remove } from 'koishi'

export const inject = ['dict']

export function apply(ctx: Context) {
  const look = ctx.command('look <names...:string>', '查询词典所有结果')
    .option('long', '-l 显示字典名')
    .option('count', '-n <count:number> ')
    .action(async ({ session, options }, ...names) => {
      if (!names.length)
        return '请输入要查询的词典，或使用 look.list 显示所有词典'

      return (await Promise.all(names.map(async (name, index) => {
        let result = await ctx.dict.lookup(name)
        if (!result.length)
          return (await session?.send(`未知字典 ${names[index]}！`), names[index])
        result.extra && (await session?.send(result.extra))
        options?.count && (result = Random.pick(result, options.count))
        return (options?.long ? `${names[index]}: ` : '') + result.join(' ')
      }))).join(options?.long ? '\n' : ' ')
    })

  look.subcommand('.list', '显示所有词典')
    .option('long', '-l 显示来源名')
    .option('depth', '-d <depth:posint> 递归深度')
    .option('includes', '-i <includes:string> 包含来源')
    .option('excludes', '-x <excludes:string> 排除来源')
    .action(async ({ session, options = {} }) => {
      const sources = ctx.dict.sources
      const scopes = options.includes?.split(',')
        || Array.from(sources.keys())
      for (const exclude of options.excludes?.split(',') || [])
        remove(scopes, exclude)

      const unknowns: string[] = []
      const promises = scopes.map<Promise<[string, string[]]>>(
        async key => sources.has(key)
          ? [key, await Array.fromAsync(sources.get(key)!.entries(options))]
          : (unknowns.push(key), [key, []]),
      )
      const entries = (await Promise.all(promises))
        .filter(([_, entries]) => entries.length)
      const lines = entries.map(([key, entries]) =>
        (options.long ? `${key}: ` : '') + entries.join(' '))

      if (session && unknowns.length)
        await session.send(`未知来源：${unknowns.join(' ')}`)
      return h.text(lines.join(options.long ? '\n' : ' '))
    })

  ctx.command('find <values...:string>', '查找查询字符串的词典')
    .option('plain', '-p 输出为纯文本')
    .option('weak', '-w 包含弱匹配结果')
    .option('chars', '-c 将输入作为字符序列处理')
    .option('scope', '-s <scope:string> 限制搜索范围')
    .action(async ({ options = {} }, ...values) => {
      if (options.chars)
        values = Array.from(values[0] || [])
      const founds = await ctx.dict.find(values, options)
      const result = Object.entries(founds).map(([key, founds]) =>
        `${h.text(key)}: ${founds
          .sort((a, b) => Number(a.weak || 0) - Number(b.weak || 0))
          .map(found => found.weak && !options.plain
            ? h('i', found.name)
            : found.name)
          .join(' ')}`).join('\n')
      return options.plain ? result : h('markdown', result)
    })

  Argv.interpolate('%(', ')', (raw) => {
    const source = h.unescape(raw)
    let index = 0
    for (let depth = 1; index < source.length; index++) {
      const current = source[index]
      if (current === '(')
        depth++
      else if (current === ')' && --depth === 0)
        break
    }
    const result = source.slice(0, index)
    if (!result) {
      const index = raw.indexOf(')')
      if (index >= 0)
        return { source: raw, rest: raw.slice(index + 1), tokens: [] }
      return { source: raw, rest: '', tokens: [] }
    }
    return {
      source: result,
      command: look,
      options: { count: 1 },
      args: [result],
      rest: h.escape(source.slice(result.length + 1)),
    }
  })
}
