import type { Context } from 'koishi'
import type { Config } from '.'
import { h } from 'koishi'

export const inject = ['dict']

export function apply(ctx: Context, config: Config) {
  function markdown(content: string) {
    return config.markdown ? h('markdown', content) : content
  }

  ctx.command('look <keys...:string>', '查询词典所有结果。')
    .option('delimiter', '-d <delim:string> 分隔符。')
    .option('long', '-l 显示完整结果。')
    .action(async ({ session, options }, ...keys) => {
      const delimiter = options?.delimiter || config.delimiter
      if (keys.length === 0) {
        return Array.from(ctx.dict.availables)
          .map(name => options?.long ? name : name.split('/').pop())
          .join(delimiter)
      }
      return (await Promise.all(keys.map(async (key, index) => {
        const result = await ctx.dict.lookup(key)
        if (!result.length)
          return keys[index]
        if (result.extra)
          await session?.send(markdown(result.extra))
        const joined = result?.join(delimiter)
        return options?.long ? `${keys[index]}: ${joined}` : joined
      }))).join('\n')
    })

  ctx.command('find <values...:string>', '查找查询字符串的词典。')
    .option('delimiter', '-d <delim:string> 分隔符。')
    .action(async ({ options }, ...values) => {
      const delimiter = options?.delimiter || config.delimiter
      return markdown(Object.entries(await ctx.dict.find(...values))
        .map(([key, founds]) => `${key}: ${founds
          .sort((a, b) => +a.weak - +b.weak)
          .map(found => found.weak
            ? config.markdown ? `*${found.name}*` : `(${found.name})`
            : found.name,
          )
          .join(delimiter)}`)
        .join('\n'))
    })

  function resolve(content: string) {
    return content.replaceAll(/%\(([^()]*)\)/g, (raw, key) => {
      return `<execute>shuf $(look ${key})</execute>`
    })
  }

  config.echo && ctx.middleware((session, next) => {
    if (!session.content)
      return next()
    const content = resolve(session.content)
    return next(() => h.parse(content))
  }, true)
}
