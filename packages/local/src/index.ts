import type { Context } from 'koishi'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-local')

declare module 'koishi' {
  interface Tables {
    dict: {
      name: string
      values: string[]
    }
  }
}

class LocalDictSource extends DictSource {
  static name = 'dict-local'
  static inject = ['dict', 'database']

  constructor(ctx: Context, public config: LocalDictSource.Config) {
    super(ctx)

    ctx.model.extend('dict', {
      name: 'char',
      values: 'list',
    }, { primary: 'name' })

    ctx.on('ready', async () => {
      let availables = await this.availables()
      const baseDir = resolve(ctx.baseDir, 'data', 'dicts')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      const promises = dirents
        .filter(dirent => dirent.isFile() && !dirent.name.startsWith('~'))
        .map(async (dirent) => {
          const fullPath = resolve(baseDir, dirent.name)
          if (dirent.name.endsWith('.json')) {
            const name = dirent.name.slice(0, -5)
            if (availables.includes(name)) {
              logger.info(`dict ${name} already loaded.`)
              return
            }
            const content = await readFile(fullPath, this.config.encoding)
            await this.tryLoadDict(name, JSON.parse(content))
          }
        })
      await Promise.all(promises)
      availables = await this.availables()
      logger.info(`loaded ${availables.length} dicts.`)
      ctx.emit('dict-added', ...availables)
    })

    ctx.on('dispose', async () => {
      const availables = await this.availables()
      ctx.emit('dict-removed', ...availables)
    })
  }

  async availables(): Promise<string[]> {
    const dicts = await this.ctx.database.get('dict', {}, ['name'])
    return dicts.map(({ name }) => name)
  }

  async tryLoadDict(name: string, data: any) {
    if (typeof data === 'string') {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      const values = lines.length > 1 ? lines : Array.from(data)
      await this.loadDict(name, values)
    }
    else if (Array.isArray(data)) {
      if (data.every(item => typeof item === 'string')) {
        await this.loadDict(name, data)
      }
      else {
        for (const item of data)
          await this.tryLoadDict(name, item)
      }
    }
    else if (typeof data === 'object' && data !== null) {
      if (typeof data.name === 'string') {
        if (typeof data.type === 'string')
          await this.pushDict(`${name.split(this.ctx.dict.separator)[0]}#${data.type}`, data.name)
        await this.pushDict(name, data.name)
        if (Array.isArray(data.children)) {
          for (const child of data.children) {
            await this.tryLoadDict(`${name}${this.ctx.dict.separator}${data.name}`, child)
          }
        }
        return
      }

      const keys = Object.keys(data)
      keys.length && await this.loadDict(name, keys)
      for (const key of keys)
        await this.tryLoadDict(`${name}${this.ctx.dict.separator}${key}`, data[key])
    }
    else {
      logger.warn(`unknown dict format: ${name}`)
    }
  }

  async loadDict(name: string, values: string[]) {
    await this.ctx.database.upsert('dict', [{ name, values }])
    logger.info(`loaded dict ${name} with ${values.length} values.`)
  }

  async pushDict(name: string, ...items: string[]) {
    const dict = await this.ctx.database.get('dict', { name })
    const values = dict[0]?.values || []
    values.push(...items)
    await this.ctx.database.upsert('dict', [{ name, values }])
    logger.debug(`pushed ${items.length} values to dict ${name}.`)
  }

  override async lookup(name: string): Promise<string[]> {
    const [dict] = await this.ctx.database.get('dict', { name })
    return dict?.values || []
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
