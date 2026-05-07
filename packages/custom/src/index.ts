import type { Context } from 'koishi'
import { opendir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-custom')

class CustomDictSource extends DictSource {
  constructor(ctx: Context, public config: CustomDictSource.Config) {
    super(ctx)

    opendir(resolve(ctx.baseDir, 'data', 'dicts'))
      .then(async (entries) => {
        for await (const entry of entries) {
          if (!entry.isFile() || entry.name.startsWith('~'))
            continue
          const fullPath = resolve(entry.parentPath, entry.name)
          if (entry.name.endsWith('.txt')) {
            const name = entry.name.replace(/\.txt$/, '')
            const content = await readFile(fullPath, this.config.encoding)
            this.loadDict(name, content.split('\n')
              .map(line => line.trim()).filter(line => line !== ''))
          }
        }
      })
      .then(() => {
        ctx.emit('dict-added', ...Array.from(this.dicts.keys()))
        logger.info(`loaded ${this.dicts.size} dicts.`)
      })
  }

  dicts: Map<string, string[]> = new Map()

  loadDict(name: string, values: string[]) {
    this.dicts.set(name, values)
    logger.debug(`loaded dict ${name} with ${values.length} values.`)
  }

  override lookupSync(name: string): string[] {
    return this.dicts.get(name) || []
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
