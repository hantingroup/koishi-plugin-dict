import type { Context } from 'koishi'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'
import {} from 'koishi-plugin-vayu'

class VayuDictSource extends DictSource {
  static name = 'dict-vayu'
  static inject = ['dict', 'database']

  constructor(ctx: Context, public config: VayuDictSource.Config) {
    super(ctx)
    ctx.on('ready', () => ctx.emit('dict-added', config.name))
    ctx.on('dispose', () => ctx.emit('dict-removed', config.name))
  }

  override availables(): Promise<Iterable<string>> {
    return Promise.resolve([this.config.name])
  }

  override async lookup(name: string) {
    if (name !== this.config.name)
      return []
    const vayus = await this.ctx.database.get('vayu', {}, ['answer'])
    return vayus.map(({ answer }) => answer) || []
  }
}

namespace VayuDictSource {
  export interface Config {
    name: string
  }

  export const Config: Schema<Config> = Schema.object({
    name: Schema.string().default('vayu').description('字典名称。'),
  })
}

export default VayuDictSource
