import type { Schema } from 'koishi'
import type { DictSource, FindOptions, Found } from './source'
import { Context, Service } from 'koishi'
import * as Command from './command'

export * from './source'

declare module 'koishi' {
  interface Context {
    dict: DictService
  }
}

class DictService extends Service<DictService.Config> {
  static name = 'dict'
  sources: Map<string, DictSource> = new Map()

  constructor(ctx: Context, public config: DictService.Config) {
    super(ctx, 'dict', true)
    ctx.plugin(Command)
  }

  register(source: DictSource) {
    if (!/^dict-(?:[a-zA-Z0-9]-?)*[a-zA-Z0-9]$/.test(source.ctx.name))
      throw new Error('dict source name must start with "dict-"')
    const name = source.ctx.name.slice('dict-'.length)
    return this[Context.origin].effect(() => {
      this.sources.set(name, source)
      return () => this.sources.delete(name)
    })
  }

  lookup(name: string) {
    return new Promise<string[] & { extra?: string }>((resolve) => {
      let pendingCount = this.sources.size
      if (!pendingCount)
        return resolve([])
      for (const promise of this.sources.values()
        .map(source => source.lookup(name))) {
        promise.then((value) => {
          if (value.length > 0)
            resolve(value)
          else if (--pendingCount === 0)
            resolve([])
        })
      }
    })
  }

  async find(
    values: string[],
    options: FindOptions,
  ): Promise<Record<string, Found[]>> {
    const founds = Object.fromEntries(values.map(value => [value, []]))
    await Promise.all(this.sources.values().map(source =>
      source.find(values, founds, options)))
    return founds
  }
}

namespace DictService {
  export interface Config extends Command.Config {}
  export const Config: Schema<Config> = Command.Config
}

export default DictService
