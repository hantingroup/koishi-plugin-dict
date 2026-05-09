import type { Context } from 'koishi'
import { opendir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-custom')

declare module 'koishi' {
  interface Tables {
    dict: {
      name: string
      values: string[]
    }
  }
}

class CustomDictSource extends DictSource {
  static inject = ['dict', 'database']

  constructor(ctx: Context, public config: CustomDictSource.Config) {
    super(ctx)

    ctx.model.extend('dict', {
      name: 'char',
      values: 'list',
    }, { primary: 'name' })

    opendir(resolve(ctx.baseDir, 'data', 'dicts'))
      .then(async (entries) => {
        const promises = []
        for await (const entry of entries) {
          if (!entry.isFile() || entry.name.startsWith('~'))
            continue
          const fullPath = resolve(entry.parentPath, entry.name)
          if (entry.name.endsWith('.txt')) {
            const name = entry.name.replace(/\.txt$/, '')
            const content = await readFile(fullPath, config.encoding)
            const values = content.split('\n')
              .map(line => line.trim())
              .filter(line => line !== '')
            promises.push(ctx.database.upsert('dict', [{ name, values }]))
          }
        }
        return Promise.all(promises)
      })
      .then(() => {
        ctx.database.get('dict', {}, ['name'])
          .then((names) => {
            for (const { name } of names)
              this.dicts.add(name)
            logger.info(`indexed ${this.dicts.size} dicts.`)
            ctx.emit('dict-added', ...Array.from(this.dicts.values()))
          })
      })
  }

  dicts: Set<string> = new Set()

  override async lookup(name: string): Promise<string[]> {
    if (!this.dicts.has(name))
      return []
    const [dict] = await this.ctx.database.get('dict', { name })
    return dict.values
  }
}

namespace CustomDictSource {
  export interface Config {
    encoding: 'ascii' | 'utf8' | 'utf16le'
  }

  export const Config: Schema<Config> = Schema.object({
    encoding: Schema.union([
      Schema.const('ascii').description('ASCII'),
      Schema.const('utf8').description('UTF-8'),
      Schema.const('utf16le').description('UTF-16LE'),
    ]).default('utf8').description('文本文件编码。'),
  })
}

export default CustomDictSource
