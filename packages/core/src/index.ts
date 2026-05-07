import type { DictSource, Found } from './source'
import { Context, remove, Schema, Service } from 'koishi'
import * as Command from './command'

export * from './source'

export interface Config {
  echo: boolean
  markdown: boolean
  delimiter: string
}

export const Config = Schema.object({
  echo: Schema.boolean().default(true).description('未捕获指令作为填字输出。'),
  markdown: Schema.boolean().default(true).description('启用 Markdown 输出。'),
  delimiter: Schema.string().default(' ').description('默认字段分隔符。'),
})

declare module 'koishi' {
  interface Context {
    dict: DictService
  }

  interface Events {
    'dict-added': (...names: string[]) => void
  }
}

class DictService extends Service {
  private sources: DictSource[] = []
  readonly availables: Set<string> = new Set()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'dict', true)
    this.config = config
    ctx.on('dict-added', (...names) => {
      for (const name of names)
        this.availables.add(name)
    })
  }

  register(source: DictSource) {
    return this[Context.origin].effect(() => {
      this.sources.push(source)
      return () => remove(this.sources, source)
    })
  }

  lookup(key: string) {
    return new Promise<string[]>((resolve) => {
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

export function apply(ctx: Context, config: Config) {
  ctx.plugin(DictService, config)
  ctx.plugin(Command, config)
}
