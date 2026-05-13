import type { Context } from 'koishi'
import type { Found } from 'koishi-plugin-dict'
import {} from '@koishijs/plugin-help'
import { h, Logger, omit, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-hongzi')

class HongziDictSource extends DictSource {
  static name = 'dict-hongzi'

  names: Set<string> = new Set()

  override async availables(): Promise<Iterable<string>> {
    return this.names
  }

  constructor(ctx: Context, public config: HongziDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const list = await ctx.http.get(`${this.config.endpoint}/list`)
      this.names = new Set(list)
      logger.info(`indexed ${this.names.size} dicts`)
      ctx.emit('dict-added', ...this.names)
    })

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.names)
    })

    ctx.command('hongzi <message:text>', '薨机的填字。')
      .option('debug', '-d 显示调用栈。')
      .action(async ({ session, options = {} }, message) => {
        if (!message.includes('[[') || !message.includes(']]'))
          return message
        const res = await this.translate(message, omit(options, ['debug']))
        options.debug && await session?.send(res.callstack)
        return h.text(res.translated)
      })

    ctx.middleware(async (session, next) => {
      if (session.content?.includes('[[') && session.content.includes(']]')) {
        const { translated } = await this.translate(session.content)
        session.content = translated
      }
      return next()
    }, true)
  }

  async translate(message: string, options: Record<string, string> = {}) {
    const url = `${this.config.endpoint}/translate`
    return await this.ctx.http.post<{
      translated: string
      callstack: string
    }>(url, {
      text: message,
      variables: options,
    })
  }

  override async lookup(name: string): Promise<string[]> {
    if (!this.names.has(name))
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
