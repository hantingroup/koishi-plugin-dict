import type { Context } from 'koishi'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'
import {} from 'koishi-plugin-hanting'

class HantingDictSource extends DictSource {
  static name = 'dict-hanting'
  static inject = ['dict', 'database']

  constructor(ctx: Context, public config: HantingDictSource.Config) {
    super(ctx)
  }

  override async* availables() { yield this.config.name }

  override async lookup(name: string) {
    if (name !== this.config.name)
      return []
    const hantings = await this.ctx.database.get('hanting', {}, ['word'])
    return hantings.map(({ word }) => word) || []
  }
}

namespace HantingDictSource {
  export interface Config {
    name: string
  }

  export const Config: Schema<Config> = Schema.object({
    name: Schema.string().default('hanting').description('字典名称。'),
  })
}

export default HantingDictSource
