import type { DictSource, Found } from './source'
import { Context, remove, Schema, Service } from 'koishi'

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

  interface Events {
    'dict-added': (...names: string[]) => void
    'dict-removed': (...names: string[]) => void
  }
}

export default class DictService extends Service {
  private sources: DictSource[] = []
  readonly availables: Set<string> = new Set()
  readonly separator: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'dict', true)
    this.separator = config.separator
    ctx.on('dict-added', (...names) => {
      for (const name of names)
        this.availables.add(name)
    })
    ctx.on('dict-removed', (...names) => {
      for (const name of names)
        this.availables.delete(name)
    })
  }

  register(source: DictSource) {
    return this[Context.origin].effect(() => {
      this.sources.push(source)
      return () => remove(this.sources, source)
    })
  }

  lookup(key: string) {
    return new Promise<string[] & { extra?: string }>((resolve) => {
      let pendingCount = this.sources.length
      for (const promise of this.sources.map(source => source.lookup(key))) {
        promise.then((value) => {
          if (value.length > 0)
            resolve(value)
          else if (--pendingCount === 0)
            resolve([])
        })
      }
    })
  }

  async find(...values: string[]): Promise<Record<string, Found[]>> {
    const founds = Object.fromEntries(values.map(value => [value, []]))
    await Promise.all(this.sources.map(source => source.find(values, founds)))
    return founds
  }
}
