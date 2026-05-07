import type { Context } from 'koishi'
import { opendir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-local')

class LocalDictSource extends DictSource {
  constructor(ctx: Context, public config: LocalDictSource.Config) {
    super(ctx)
    opendir(resolve(ctx.baseDir, 'data', 'dicts'))
      .then(async (entries) => {
        for await (const entry of entries) {
          if (!entry.isFile() || entry.name.startsWith('~'))
            continue
          const fullPath = resolve(entry.parentPath, entry.name)
          if (entry.name.endsWith('.json')) {
            const name = entry.name.slice(0, -5)
            const content = await readFile(fullPath, this.config.encoding)
            this.tryLoadDict(name, JSON.parse(content))
          }
        }
      })
      .then(() => {
        logger.info(`loaded ${this.dicts.size} dicts.`)
        ctx.emit('dict/register', Array.from(this.dicts.keys()))
      })
  }

  dicts: Map<string, string[]> = new Map()

  tryLoadDict(name: string, data: any) {
    if (typeof data === 'string') {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      const values = lines.length > 1 ? lines : Array.from(data)
      this.loadDict(name, values)
    }
    else if (Array.isArray(data)) {
      if (data.every(item => typeof item === 'string')) {
        this.loadDict(name, data)
      }
      else {
        for (const item of data)
          this.tryLoadDict(name, item)
      }
    }
    else if (typeof data === 'object' && data !== null) {
      if (typeof data.name === 'string') {
        if (typeof data.type === 'string')
          this.pushDict(`${name.split('/')[0]}#${data.type}`, data.name)
        this.pushDict(name, data.name)
        if (Array.isArray(data.children)) {
          for (const child of data.children) {
            this.tryLoadDict(`${name}/${data.name}`, child)
          }
        }
        return
      }

      const keys = Object.keys(data)
      keys.length && this.loadDict(name, keys)
      for (const key of keys)
        this.tryLoadDict(`${name}/${key}`, data[key])
    }
    else {
      logger.warn(`unknown dict format: ${name}`)
    }
  }

  loadDict(name: string, values: string[]) {
    this.dicts.set(name, values)
    logger.debug(`loaded dict ${name} with ${values.length} values.`)
  }

  pushDict(name: string, ...values: string[]) {
    this.loadDict(name, [...this.dicts.get(name) || [], ...values])
  }

  override lookupSync(name: string): string[] {
    return this.dicts.get(name) || []
  }
}

namespace LocalDictSource {
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

export default LocalDictSource
