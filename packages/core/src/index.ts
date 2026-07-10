import type { DictSource, FindOptions, Found } from './source'
import { Context, Schema, Service } from 'koishi'

export * from './source'

export interface Config {
  separator: string
}

export const Config = Schema.object({
  separator: Schema.string().default('/').description('层级字典分隔符。'),
})

declare module 'koishi' {
  interface Context {
    dict: DictService
  }
}

export default class DictService extends Service {
  static name = 'dict'

  sources: Map<string, DictSource> = new Map()

  get sep() {
    return this.config.separator
  }

  join(...names: any[]) {
    return names.filter(Boolean).join(this.sep)
  }

  split(name: string) {
    return name.split(this.sep)
  }

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'dict', true)
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

  async find(
    names: string[] | 'availables' = 'availables',
    values: string[],
    options: FindOptions,
  ): Promise<Record<string, Found[]>> {
    const founds = Object.fromEntries(values.map(value => [value, []]))
    await Promise.all(this.sources.values().map(async (source) => {
      await source.find(names === 'availables'
        ? await Array.fromAsync(source.availables())
        : names, values, founds, options)
    }))
    return founds
  }
}
