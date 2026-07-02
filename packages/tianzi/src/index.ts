import type { Context } from 'koishi'
import type { Found } from 'koishi-plugin-dict'
import {} from '@koishijs/plugin-help'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

class TianziDictSource extends DictSource {
  static name = 'dict-tianzi'

  names: Set<string> = new Set()

  override async availables(): Promise<Iterable<string>> {
    return this.names
  }

  prefixedNames(): string[] {
    return Array.from(this.names)
      .map(name => this.ctx.dict.join(this.config.name, name))
  }

  constructor(ctx: Context, public config: TianziDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      this.names = new Set(await ctx.http.get(`${this.config.endpoint}/list`))
      ctx.logger.info(`indexed ${this.names.size} dicts`)
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
      return Array.from(this.names)
    const path = this.ctx.dict.split(name)
    path.unshift()
    name = this.ctx.dict.join(path)
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

namespace TianziDictSource {
  export interface Config {
    endpoint: string
    name?: string
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link').default('https://tianzi.pbhh.net').description('字典接口地址。'),
    name: Schema.string().default('Lvory').description('字典名称。'),
  })
}

export default TianziDictSource
