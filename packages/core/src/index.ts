import type { Dict } from 'koishi'
import type { DictSource, Found } from './source'
import { Context, Schema, Service } from 'koishi'
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
    return this[Context.origin].effect(() => {
      const { name } = source.ctx
      this.sources.set(name, source)
      return () => this.sources.delete(name)
    })
  }

  lookup(name: string) {
    return new Promise<string[] & { extra?: string }>((resolve) => {
      let pendingCount = this.sources.size
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

  async findFrom(
    names: string[] | 'availables' = 'availables',
    values: string[],
    options: Dict<any>,
  ): Promise<Record<string, Found[]>> {
    const founds = Object.fromEntries(values.map(value => [value, []]))
    await Promise.all(this.sources.values().map(source =>
      source.findFrom(names, values, founds, options)))
    return founds
  }
}

namespace DictService {
  export interface Config {}
  export const Config = Schema.object({})
}

export default DictService
