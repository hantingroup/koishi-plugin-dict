import type { Context } from 'koishi'
import {} from '@koishijs/plugin-help'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-hongzi')

class HongziDictSource extends DictSource {
  availables: string[] = []

  constructor(ctx: Context, public config: HongziDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      this.availables = await ctx.http.get(`${this.config.endpoint}/list`)
      logger.info(`indexed ${this.availables.length} dicts`)
      ctx.emit('dict-added', ...this.availables)
    })

    this.ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.availables)
    })
  }

  override async lookup(name: string): Promise<string[]> {
    return this.availables.includes(name)
      ? await this.ctx.http
          .get(`${this.config.endpoint}/list/${encodeURIComponent(name)}`)
      : []
  }
}

namespace HongziDictSource {
  export interface Config {
    endpoint: string
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.transform(
      Schema.string().role('url'),
      url => url.replace(/\/$/, ''),
    ).default('http://pbhh.net:8426').description('字典接口地址。'),
  })
}

export default HongziDictSource
