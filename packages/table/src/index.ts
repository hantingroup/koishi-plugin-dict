import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api'
import type { Context } from 'koishi'
import type { Dirent } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

type Unshift<Ts extends any[]> = Ts extends [any, ...infer Tail] ? Tail : []

class TableDictSource extends DictSource {
  static name = 'dict-table'
  static inject = ['dict', 'database']

  private connection?: DuckDBConnection

  tables: Map<string, { path: string, columns: string[] }> = new Map()
  override async* entries() { yield* this.tables.keys() }

  constructor(ctx: Context, public config: TableDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const instance = await DuckDBInstance.create()
      this.connection = await instance.connect()

      const baseDir = resolve(ctx.baseDir, 'data', 'dicts', 'tables')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      await Promise.all(dirents.map(dirent => this.indexDirent(dirent)))
      ctx.logger.info(`indexed ${this.tables.size} dicts`)
    })
  }

  async indexDirent(dirent: Dirent) {
    const path = resolve(dirent.parentPath, dirent.name)
    if (dirent.name.endsWith('.csv')) {
      const name = dirent.name.replace(/\..+$/, '')
      this.tables.set(name, { path, columns: [] })
      const result = await this.select(name, [], 'LIMIT 0')
      this.tables.get(name)!.columns = result.columnNames()
    }
  }

  override async lookup(name: string): Promise<string[]> {
    let table = name
    let column = '0'
    if (name.includes('#'))
      [table, column] = name.split('#')
    if (!this.tables.has(table))
      return []
    const { columns } = this.tables.get(table)!
    if (column === '')
      return columns
    if (!columns.includes(column))
      return []

    const result = await this.select(table, [column])
    const rows = await result.getRows()
    return rows.map(row => row[0] as string)
  }

  async select(...args: Unshift<Parameters<typeof this.select_>>) {
    // eslint-disable-next-line style/max-statements-per-line
    try { return await this.select_(false, ...args) }
    catch { return await this.select_(true, ...args) }
  }

  private async select_(
    parallel: boolean,
    table: string,
    columns: string[] = [],
    clause: string = '',
    values: DuckDBValue[] = [],
  ) {
    columns = columns.map(column => `"${column.replaceAll(/"/g, '""')}"`)
    if (!columns.length)
      columns.push('*')
    return await this.connection!.run(
      `SELECT ${columns} FROM read_csv(?
        , delim=','
        , quote='"'
        , escape='"'
        , comment='#'
        , header=true
        , parallel=${parallel}
        , strict_mode=false
        , null_padding=true
      ) ${clause}`,
      [this.tables.get(table)!.path, ...values],
    )
  }
}

namespace TableDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default TableDictSource
