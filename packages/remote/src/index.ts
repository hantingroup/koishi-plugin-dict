import type { Context } from 'koishi'
import type { Found } from 'koishi-plugin-dict'
import {} from '@koishijs/plugin-help'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

class RemoteDictSource extends DictSource {
  static name = 'dict-remote'

  names: Set<string> = new Set()

  override async* availables() {
    yield* this.names
  }

  constructor(ctx: Context, public config: RemoteDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      this.names = new Set(await ctx.http.get(`${this.config.endpoint}/list`))
      ctx.logger.info(`indexed ${this.names.size} dicts`)
    })

    ctx.on('dispose', () => {})
  }

  override async lookup(name: string): Promise<string[]> {
    if (!this.names.has(name))
      return []
    const url = `${this.config.endpoint}/list/${encodeURIComponent(name)}`
    return await this.ctx.http.get(url)
  }

  override async find(
    names: string[] | null,
    values: string[],
    founds: Record<string, Found[]>,
  ) {
    for (const value of values) {
      const result: string[] = await this.ctx.http
        .get(`${this.config.endpoint}/find/${encodeURIComponent(value)}`)
      founds[value].push(...result.flatMap(name =>
        (!names || names.includes(name)) ? [{ name }] : []))
    }
  }
}

namespace RemoteDictSource {
  export interface Config {
    endpoint: string
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link').default('https://tianzi.pbhh.net').description('字典接口地址。'),
  })
}

export default RemoteDictSource
