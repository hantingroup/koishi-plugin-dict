import type { Context } from 'koishi'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-alias')

class AliasDictSource extends DictSource {
  constructor(ctx: Context, public config: AliasDictSource.Config) {
    super(ctx)
    ctx.on('dict-added', (...names) => {
      const before = this.aliases.size
      for (const name of names) {
        const path = name.split(ctx.dict.separator)
        let suffix = path.pop()!
        while (suffix !== name) {
          if (this.aliases.has(suffix))
            this.aliases.get(suffix)!.push(name)
          else
            this.aliases.set(suffix, [name])
          logger.debug(`${suffix} -> ${name}`)
          suffix = `${path.pop()}${ctx.dict.separator}${suffix}`
        }
      }
      const diff = this.aliases.size - before
      diff && logger.info(`resolved ${diff} more aliases, ${this.aliases.size} in total.`)
    })
  }

  aliases: Map<string, string[]> = new Map()

  override lookup(key: string) {
    const names = this.aliases.get(key) || []
    if (names.length === 0)
      return Promise.resolve([])
    if (names.length === 1)
      return this.ctx.dict.lookup(names[0])
    return Promise.resolve(Object.assign(names, {
      extra: `冲突别名！${key} -> ${names.join(' ')}`,
    }))
  }
}

namespace AliasDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default AliasDictSource
