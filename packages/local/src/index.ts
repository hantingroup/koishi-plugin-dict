import type { Context } from 'koishi'
import { mkdir, opendir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-local')

class LocalDictSource extends DictSource {
  constructor(ctx: Context, public config: LocalDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const baseDir = resolve(ctx.baseDir, 'data', 'dicts')
      await mkdir(baseDir, { recursive: true })
      for await (const entry of await opendir(baseDir)) {
        if (!entry.isFile() || entry.name.startsWith('~'))
          continue
        const fullPath = resolve(baseDir, entry.name)
        if (entry.name.endsWith('.json')) {
          let needBuild = false
          const cachedPath = resolve(baseDir, 'cache', entry.name)
          const name = entry.name.slice(0, -5)
          if (this.config.caches.includes(name)) {
            await mkdir(resolve(baseDir, 'cache'), { recursive: true })
            try {
              const content = await readFile(cachedPath, this.config.encoding)
              this.tryLoadDict(name, JSON.parse(content))
            }
            catch { needBuild = true }
          }

          const content = await readFile(fullPath, this.config.encoding)
          this.tryLoadDict(name, JSON.parse(content))

          if (needBuild) {
            const dicts = Object.fromEntries(this.dicts.entries()
              .filter(([key]) => key.split(this.ctx.dict.separator)[0] === name))
            await writeFile(cachedPath, JSON.stringify(dicts), this.config.encoding)
          }
        }
      }
      logger.info(`loaded ${this.dicts.size} dicts.`)
      ctx.emit('dict-added', ...this.dicts.keys())
    })

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.dicts.keys())
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
          this.pushDict(`${name.split(this.ctx.dict.separator)[0]}#${data.type}`, data.name)
        this.pushDict(name, data.name)
        if (Array.isArray(data.children)) {
          for (const child of data.children) {
            this.tryLoadDict(`${name}${this.ctx.dict.separator}${data.name}`, child)
          }
        }
        return
      }

      const keys = Object.keys(data)
      keys.length && this.loadDict(name, keys)
      for (const key of keys)
        this.tryLoadDict(`${name}${this.ctx.dict.separator}${key}`, data[key])
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
    caches: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    encoding: Schema.union([
      Schema.const('ascii').description('ASCII'),
      Schema.const('utf8').description('UTF-8'),
      Schema.const('utf16le').description('UTF-16LE'),
    ]).default('utf8').description('文本文件编码。'),
    caches: Schema.array(Schema.string()).description('预构建的字典。'),
  })
}

export default LocalDictSource
