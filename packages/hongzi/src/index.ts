import type { Context } from 'koishi'
import type { Found } from 'koishi-plugin-dict'
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

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.availables)
    })

    ctx.command('hongzi <message:text>', '薨机的填字。')
      .option('debug', '-d 显示调用栈。')
      .action(async ({ session, options }, message) => {
        if (!message.includes('[[') || !message.includes(']]'))
          return message
        const debug = (options ??= {}).debug
        delete options.debug
        const url = `${this.config.endpoint}/translate`
        const { translated, callstack } = await ctx.http.post(url, {
          text: message,
          variables: options,
        })
        if (debug)
          session?.send(callstack)
        return translated
      })
  }

  override async lookup(name: string): Promise<string[]> {
    if (!this.availables.includes(name))
      return []
    const url = `${this.config.endpoint}/list/${encodeURIComponent(name)}`
    return await this.ctx.http.get(url)
  }

  async find(values: string[], founds: Record<string, Found[]>) {
    for (const value of values) {
      const result: string[] = await this.ctx.http
        .get(`${this.config.endpoint}/find/${encodeURIComponent(value)}`)
      founds[value].push(...result.map(name => ({ name, weak: false })))
    }
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
