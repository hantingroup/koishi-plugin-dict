import type { Context } from 'koishi'
import { Argv, h, Random } from 'koishi'

export const inject = ['dict']

export function apply(ctx: Context) {
  const look = ctx.command('look <keys...:string>', '查询词典所有结果。')
    .option('long', '-l 显示字典名。')
    .option('prefixed', '-p 添加字典前缀。')
    .option('count', '-n <count:number> ')
    .action(async ({ session, options }, ...keys) => {
      if (keys.length === 0) {
        return Array.from(ctx.dict.availables)
          .map(name => options?.long ? name : name.split('/').pop())
          .join(' ')
      }
      return (await Promise.all(keys.map(async (key, index) => {
        let result = await ctx.dict.lookup(key)
        if (!result.length) {
          const key = keys[index]
          session?.send(`look ${key.search(/\s/) ? `"${key}"` : key}: 未知字典！`)
          return key
        }
        if (result.extra)
          await session?.send(result.extra)
        if (options?.count)
          result = Random.pick(result, options.count)
        const joined = options?.prefixed
          ? result.map(item => `${key}/${item}`).join(' ')
          : result.join(' ')
        return options?.long ? `${keys[index]}: ${joined}` : joined
      }))).join('\n')
    })

  ctx.command('find <values...:string>', '查找查询字符串的词典。')
    .option('markdown', '-m 启用 markdown 输出。')
    .action(async ({ options }, ...values) => {
      const result = Object.entries(await ctx.dict.find(...values))
        .map(([key, founds]) => `${key}: ${founds
          .sort((a, b) => +a.weak - +b.weak)
          .map(found => found.weak
            ? options?.markdown ? `*${found.name}*` : `(${found.name})`
            : found.name,
          )
          .join(' ')}`)
        .join('\n')
      return options?.markdown ? h('markdown', result) : result
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
