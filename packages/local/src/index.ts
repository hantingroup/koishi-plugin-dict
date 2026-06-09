import type { Context } from 'koishi'
import type { FindOptions, Found } from 'koishi-plugin-dict'
import type { Dirent } from 'node:fs'
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

const dictName = /^([^#]+|[^/#]+#.+)$/

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
      await Promise.all(dirents.map(dirent =>
        this.loadDirent(availables, dirent)))
      await this.flush()
      availables = await this.availables()
      logger.info(`loaded ${availables.length} dicts`)
      ctx.emit('dict-added', ...availables)
    })

    ctx.on('dispose', async () => {
      const availables = await this.availables()
      ctx.emit('dict-removed', ...availables)
    })
  }

  async loadDirent(availables: string[], dirent: Dirent, parent?: string): Promise<void> {
    const fullPath = resolve(dirent.parentPath, dirent.name)
    const stem = dirent.name.replace(/\..+$/, '')
    const name = this.ctx.dict.join(parent, stem)

    if (availables.includes(name))
      return logger.info(`dict ${name} already loaded`)

    if (parent)
      await this.pushDict(parent, stem)

    if (dirent.isDirectory()) {
      const dirents = await readdir(fullPath, { withFileTypes: true })
      return void await Promise.all(dirents.map(entry =>
        this.loadDirent(availables, entry, name)))
    }

    if (dirent.name.endsWith('.json')) {
      const content = await readFile(fullPath, this.config.encoding)
      await this.tryLoadDict(name, JSON.parse(content))
    }
  }

  override async availables(): Promise<string[]> {
    const dicts = await this.ctx.database.get('dict', {}, ['name'])
    return dicts.map(({ name }) => name).filter(name => dictName.test(name))
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
        if (typeof data.type === 'string') {
          const path = this.ctx.dict.split(name)
          while (path.length) {
            const prefix = this.ctx.dict.join(...path)
            await this.pushDict(`${prefix}#${data.type}`, data.name)
            path.pop()
          }
        }
        await this.pushDict(name, data.name)
        for (const child of Array.isArray(data.children) ? data.children : [])
          await this.tryLoadDict(this.ctx.dict.join(name, data.name), child)
      }
      else {
        const keys = Object.keys(data)
        keys.length && await this.loadDict(name, keys)
        for (const key of keys)
          await this.tryLoadDict(this.ctx.dict.join(name, key), data[key])
      }
    }
    else {
      logger.warn(`unknown dict format: ${name}`)
    }
  }

  buffer: Map<string, string[]> = new Map()

  async loadDict(name: string, values: string[]) {
    this.buffer.set(name, values)
    if (this.buffer.size >= this.config.maxBufferSize)
      await this.flush()
  }

  async pushDict(name: string, ...values: string[]) {
    await this.loadDict(name, [...this.buffer.get(name) || [], ...values])
  }

  async flush() {
    const dicts = new Map((await this.ctx.database.get('dict', {
      name: Array.from(this.buffer.keys()),
    })).map(dict => [dict.name, dict.values]))
    for (const [name, items] of this.buffer)
      dicts.set(name, [...dicts.get(name) || [], ...items])
    const entries = Array.from(dicts.entries())
      .map(([name, values]) => ({ name, values }))
    await this.ctx.database.upsert('dict', entries)
    if (entries.length) {
      logger.info(`flushed ${entries.length} dicts, `
        + `from ${entries[0].name} to ${entries[entries.length - 1].name}`)
    }
    this.buffer.clear()
  }

  override async lookup(name: string): Promise<string[]> {
    const [dict] = await this.ctx.database.get('dict', { name })
    return dict?.values || []
  }

  override async find(
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    for (const value of values) {
      const dicts = (await this.ctx.model.get('dict', {
        values: { $el: value },
        name: dictName,
      }, ['name']))
      founds[value].push(...dicts.map(({ name }) => ({ name, value })))
    }
    if (!options.weak)
      return
    for (const value of values) {
      const dicts = (await this.ctx.model.get('dict', {
        values: { $el: `%${value}%` },
        name: { $and: [
          { $regex: dictName },
          { $nin: founds[value].map(found => found.name) },
        ] },
      }, ['name']))
      founds[value].push(...dicts.map(({ name }) => ({ name, value, weak: true })))
    }
  }
}

namespace LocalDictSource {
  export interface Config {
    maxBufferSize: number
    encoding: 'ascii' | 'utf8' | 'utf16le'
  }

  export const Config: Schema<Config> = Schema.object({
    maxBufferSize: Schema.number().default(1000).description('最大缓冲字典数量。'),
    encoding: Schema.union([
      Schema.const('ascii').description('ASCII。'),
      Schema.const('utf8').description('UTF-8。'),
      Schema.const('utf16le').description('UTF-16LE。'),
    ]).default('utf8').description('文本文件编码。'),
  })
}

export default LocalDictSource
