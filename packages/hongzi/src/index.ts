import type { Context } from 'koishi'
import type { Found } from 'koishi-plugin-dict'
import {} from '@koishijs/plugin-help'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-hongzi')

class HongziDictSource extends DictSource {
  static name = 'dict-hongzi'

  names: Set<string> = new Set()

  override async availables(): Promise<Iterable<string>> {
    return this.names
  }

  prefixedNames(): string[] {
    return Array.from(this.names)
      .map(name => this.ctx.dict.join(this.config.name, name))
  }

  constructor(ctx: Context, public config: HongziDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      this.names = new Set(await ctx.http.get(`${this.config.endpoint}/list`))
      logger.info(`indexed ${this.names.size} dicts`)
      ctx.emit('dict-added', ...this.prefixedNames())
      this.config.name && ctx.emit('dict-added', this.config.name)
    })

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.prefixedNames())
      this.config.name && ctx.emit('dict-removed', this.config.name)
    })
  }

  override async lookup(name: string): Promise<string[]> {
    if (name === this.config.name)
      return [...this.names]
    name = this.ctx.dict.join(this.ctx.dict.split(name).unshift())
    if (!this.names.has(name))
      return []
    const url = `${this.config.endpoint}/list/${encodeURIComponent(name)}`
    return await this.ctx.http.get(url)
  }

  async find(values: string[], founds: Record<string, Found[]>) {
    for (const value of values) {
      const result: string[] = await this.ctx.http
        .get(`${this.config.endpoint}/find/${encodeURIComponent(value)}`)
      founds[value].push(...result.map(name => ({ name })))
    }
  }
}

namespace HongziDictSource {
  export interface Config {
    endpoint: string
    name?: string
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.transform(
      Schema.string().role('url'),
      url => url.replace(/\/$/, ''),
    ).default('http://pbhh.net:8426').description('字典接口地址。'),
    name: Schema.string().default('Lvory').description('字典名称。'),
  })
}

export default HongziDictSource
