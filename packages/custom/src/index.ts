import type { Context } from 'koishi'
import type { FindOptions, Found } from 'koishi-plugin-dict'
import { opendir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-custom')

declare module 'koishi' {
  interface Tables {
    custom_dict: {
      name: string
      values: string[]
    }
  }
}

class CustomDictSource extends DictSource {
  static name = 'dict-custom'
  static inject = ['dict', 'database']

  names: Set<string> = new Set()

  override async availables(): Promise<Iterable<string>> {
    return this.names
  }

  constructor(ctx: Context, public config: CustomDictSource.Config) {
    super(ctx)

    ctx.model.extend('custom_dict', {
      name: 'char',
      values: 'list',
    }, { primary: 'name' })

    ctx.on('ready', async () => {
      if (this.config.sync)
        await this.sync()

      const dicts = await ctx.database.get('custom_dict', {}, ['name'])
      for (const { name } of dicts)
        this.names.add(name)
      logger.info(`indexed ${this.names.size} dicts.`)
      ctx.emit('dict-added', ...this.names.values())
    })

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.names.values())
    })
  }

  override async lookup(name: string): Promise<string[]> {
    if (!this.names.has(name))
      return []
    const [dict] = await this.ctx.database.get('custom_dict', { name })
    return dict.values
  }

  async sync() {
    const entries = await opendir(resolve(this.ctx.baseDir, 'data', 'dicts'))
    const promises = []
    for await (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('~'))
        continue
      const fullPath = resolve(entry.parentPath, entry.name)
      if (entry.name.endsWith('.txt')) {
        const name = entry.name.replace(/\.txt$/, '')
        const content = await readFile(fullPath, this.config.encoding)
        const values = content.split('\n')
          .map(line => line.trim())
          .filter(line => line !== '')
        promises.push(this.ctx.database.upsert('custom_dict', [{ name, values }]))
      }
    }
    await Promise.all(promises)
  }

  override async find(
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    for (const value of values) {
      const names = (await this.ctx.model.get('custom_dict', {
        values: { $el: value },
        name: { $not: { $regex: '#' } },
      }, ['name']))
      founds[value].push(...names.map(({ name }) => ({ name, value })))
    }
    if (!options.weak)
      return
    for (const value of values) {
      const names = (await this.ctx.model.get('custom_dict', {
        values: { $el: `%${value}%` },
        name: { $and: [
          { $not: { $regex: '#' } },
          { $nin: founds[value].map(found => found.name) },
        ] },
      }, ['name']))
      founds[value].push(...names.map(({ name }) => ({ name, value, weak: true })))
    }
  }
}

namespace CustomDictSource {
  export interface Config {
    sync: boolean
    encoding: 'ascii' | 'utf8' | 'utf16le'
  }

  export const Config: Schema<Config> = Schema.object({
    sync: Schema.boolean().default(false).description('同步文件到数据库。'),
    encoding: Schema.union([
      Schema.const('ascii').description('ASCII'),
      Schema.const('utf8').description('UTF-8'),
      Schema.const('utf16le').description('UTF-16LE'),
    ]).default('utf8').description('文本文件编码。'),
  })
}

export default CustomDictSource
