import type { Context } from 'koishi'
import { Argv, h, Random } from 'koishi'
import {} from 'koishi-plugin-dict'

export const name = 'dict'
export const inject = ['dict']

export function apply(ctx: Context) {
  const look = ctx.command('look <...names:string>', '查询词典所有结果')
    .option('long', '-l 显示字典名')
    .option('prefixed', '-p 添加字典前缀')
    .option('count', '-n <count:number> ')
    .action(async ({ session, options }, ...names) => {
      if (!names.length)
        return '请输入要查询的词典，或使用 look.list 显示所有词典'

      return (await Promise.all(names.map(async (name, index) => {
        let result = await ctx.dict.lookup(name)
        if (!result.length) {
          const name = names[index]
          session?.send(`look ${name.search(/\s/) ? `"${name}"` : name}: 未知字典！`)
          return name
        }
        if (result.extra)
          await session?.send(result.extra)
        if (options?.count)
          result = Random.pick(result, options.count)
        const joined = options?.prefixed
          ? result.map(item => ctx.dict.join(name, item)).join(' ')
          : result.join(' ')
        return options?.long ? `${names[index]}: ${joined}` : joined
      }))).join('\n')
    })

  look.subcommand('.list [prefix:string]', '显示所有词典')
    .option('long', '-l 显示字典全名')
    .option('all', '-a 显示所有词典')
    .action(async ({ options }, prefix = '') => {
      const names = Array.from(ctx.dict.availables)
        .filter(name => name.startsWith(prefix))
        .filter(name => options?.all || !name.includes('#'))
        .map(name => options?.long ? name : ctx.dict.split(name).pop())
      return names.join(' ')
    })

  ctx.command('find <...values:string>', '查找查询字符串的词典')
    .option('plain', '-p 输出为纯文本')
    .option('weak', '-w 包含弱匹配结果')
    .action(async ({ options = {} }, ...values) => {
      const result = Object.entries(await ctx.dict.find(values, options))
        .map(([key, founds]) => `${h.text(key)}: ${founds
          .sort((a, b) => Number(a.weak || 0) - Number(b.weak || 0))
          .map(found => found.weak && !options?.plain
            ? h('i', found.name)
            : h.text(found.name))
          .join(options?.plain ? ' ' : '&nbsp;')}`)
        .join('\n')
      return options?.plain ? result : h('markdown', result)
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
