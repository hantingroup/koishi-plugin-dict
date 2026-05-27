import type { Context } from 'koishi'
import { Logger, remove, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-alias')

class AliasDictSource extends DictSource {
  static name = 'dict-alias';

  * suffixes(name: string) {
    const path = this.ctx.dict.split(name)
    let suffix = path.pop()!
    while (suffix !== name) {
      yield suffix
      suffix = this.ctx.dict.join(path.pop()!, suffix)
    }
  }

  constructor(ctx: Context, public config: AliasDictSource.Config) {
    super(ctx)

    ctx.on('dict-added', (...names) => {
      const before = this.aliases.size
      for (const name of names) {
        for (const suffix of this.suffixes(name)) {
          if (this.aliases.has(suffix))
            this.aliases.get(suffix)!.push(name)
          else
            this.aliases.set(suffix, [name])
          logger.debug(`added: ${suffix} -> ${name}`)
        }
      }
      const diff = this.aliases.size - before
      diff && logger.info(`resolved ${diff} more aliases, ${this.aliases.size} in total`)
    })

    ctx.on('dict-removed', (...names) => {
      const before = this.aliases.size
      for (const name of names) {
        for (const suffix of this.suffixes(name)) {
          const names = this.aliases.get(suffix)
          names ? remove(names, name) : logger.warn(`alias ${suffix} not found`)
          logger.debug(`removed: ${suffix} -> ${name}`)
        }
      }
      const diff = this.aliases.size - before
      diff && logger.info(`removed ${diff} aliases, ${this.aliases.size} left`)
    })
  }

  aliases: Map<string, string[]> = new Map()

  override lookup(name: string) {
    const names = this.aliases.get(name) || []
    if (names.length === 0)
      return Promise.resolve([])
    if (names.length === 1)
      return this.ctx.dict.lookup(names[0])
    return Promise.resolve(Object.assign(names, {
      extra: `冲突别名！${name} -> ${names.join(' ')}`,
    }))
  }
}

namespace AliasDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default AliasDictSource
