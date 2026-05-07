import type { Context } from 'koishi'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-alias')

class AliasDictSource extends DictSource {
  constructor(ctx: Context, public config: AliasDictSource.Config) {
    super(ctx)
    ctx.on('dict-added', (...names) => {
      for (const name of names) {
        const shortcut = name.split('/').pop()!
        if (shortcut !== name) {
          if (this.aliases.has(shortcut))
            this.aliases.get(shortcut)!.push(name)
          else
            this.aliases.set(shortcut, [name])
          logger.debug(`${shortcut} -> ${name}`)
        }
      }
      logger.info(`resolved ${this.aliases.size} aliases.`)
    })
  }

  aliases: Map<string, string[]> = new Map()

  override lookup(key: string) {
    const names = this.aliases.get(key) || []
    if (names.length === 0)
      return Promise.resolve([])
    if (names.length === 1)
      return this.ctx.dict.lookup(names[0])
    return Promise.resolve(names)
  }
}

namespace AliasDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default AliasDictSource
