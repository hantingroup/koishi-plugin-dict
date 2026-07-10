import type { Context } from 'koishi'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

class DatabaseDictSource extends DictSource {
  static name = 'dict-database'
  static inject = ['dict', 'database']

  constructor(ctx: Context, public config: DatabaseDictSource.Config) {
    super(ctx)
  }

  override async* availables() {
    yield* this.config.entries.map(entry => entry.name)
  }

  override async lookup(name: string) {
    const entry = this.config.entries.find(entry => entry.name === name) as any
    if (entry) {
      const { table, column } = entry
      const data = await this.ctx.database.get(table, {}, [column])
      return data.map(item => item[column])
    }
    return []
  }
}

namespace DatabaseDictSource {
  export interface Config {
    entries: Record<'name' | 'table' | 'column', string>[]
  }

  export const Config: Schema<Config> = Schema.object({
    entries: Schema.array(Schema.object({
      name: Schema.string().description('字典名'),
      table: Schema.string().description('表名'),
      column: Schema.string().description('列名'),
    })).role('table').description('数据库字典'),
  })
}

export default DatabaseDictSource
