import type { DuckDBConnection } from '@duckdb/node-api'
import type { Context } from 'koishi'
import type { Dirent } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DuckDBInstance } from '@duckdb/node-api'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

class TableDictSource extends DictSource {
  static name = 'dict-table'
  static inject = ['dict', 'database']

  private instance?: DuckDBInstance
  private connection?: DuckDBConnection

  constructor(ctx: Context, public config: TableDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      this.instance = await DuckDBInstance.create()
      this.connection = await this.instance.connect()

      const baseDir = resolve(ctx.baseDir, 'data', 'tables')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      await Promise.all(dirents.map(dirent => this.indexDirent(dirent)))
      const availables = await this.availables()
      ctx.logger.info(`indexed ${availables.length} dicts`)
      ctx.emit('dict-added', ...availables)
    })

    ctx.on('dispose', async () => {
      const availables = await this.availables()
      ctx.emit('dict-removed', ...availables)
    })
  }

  async indexDirent(dirent: Dirent, parent?: string): Promise<void> {
    const fullPath = resolve(dirent.parentPath, dirent.name)
    const stem = dirent.name.replace(/\..+$/, '')
    const name = this.ctx.dict.join(parent, stem)

    if (dirent.isDirectory()) {
      const dirents = await readdir(fullPath, { withFileTypes: true })
      const promises = dirents.map(entry => this.indexDirent(entry, name))
      return void await Promise.all(promises)
    }

    if (dirent.name.endsWith('.csv')) {
      this.paths.set(name, fullPath)
      const result = await this.connection!.run(
        `SELECT * FROM read_csv(?, null_padding = true) LIMIT 0`,
        [fullPath],
      )
      this.tables.set(name, result.columnNames())
    }
  }

  paths: Map<string, string> = new Map()
  tables: Map<string, string[]> = new Map()

  override async availables(): Promise<string[]> {
    return Array.from(this.tables.keys())
  }

  override async lookup(name: string): Promise<string[]> {
    let table = name
    let column = '0'
    if (name.includes('#'))
      [table, column] = name.split('#')
    if (!this.tables.has(table))
      return []
    const columns = this.tables.get(table)!
    if (column === '')
      return columns
    if (!columns.includes(column))
      return []
    const result = await this.connection!.run(
      `SELECT "${column}" FROM read_csv(?)`,
      [this.paths.get(table)!],
    )
    const rows = await result.getRows()
    return rows.flatMap(row => row[0] ? [row[0] as string] : [])
  }
}

namespace TableDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default TableDictSource
