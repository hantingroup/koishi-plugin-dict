import type { Context } from 'koishi'
import type { FindOptions, Found } from 'koishi-plugin-dict'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

declare module 'koishi' {
  interface Tables {
    'dict.local': {
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

    ctx.model.extend('dict.local', {
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
      ctx.logger.info(`loaded ${availables.length} dicts`)
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
      return this.ctx.logger.info(`dict ${name} already loaded`)

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
    const dicts = await this.ctx.database.get('dict.local', {}, ['name'])
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
      this.ctx.logger.warn(`unknown dict format: ${name}`)
    }
  }

  buffer: Map<string, string[]> = new Map()

  async loadDict(name: string, values: string[]) {
    this.buffer.set(name, values)
    if (this.buffer.size >= this.config.bufferSize)
      await this.flush()
  }

  async pushDict(name: string, ...values: string[]) {
    await this.loadDict(name, values.concat(this.buffer.get(name) || []))
  }

  async flush() {
    const dicts = new Map((await this.ctx.database.get('dict.local', {
      name: Array.from(this.buffer.keys()),
    })).map(dict => [dict.name, dict.values]))
    for (const [name, items] of this.buffer)
      dicts.set(name, items.concat(dicts.get(name) || []))
    const entries = Array.from(dicts.entries())
      .map(([name, values]) => ({ name, values }))
    await this.ctx.database.upsert('dict.local', entries)
    if (entries.length) {
      this.ctx.logger.info(`flushed ${entries.length} dicts, `
        + `from ${entries[0].name} to ${entries[entries.length - 1].name}`)
    }
    this.buffer.clear()
  }

  override async lookup(name: string): Promise<string[]> {
    const [dict] = await this.ctx.database.get('dict.local', { name })
    return dict?.values || []
  }

  override async find(
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    for (const value of values) {
      const dicts = (await this.ctx.model.get('dict.local', {
        values: { $el: value },
      }, ['name']))
      founds[value].push(...dicts.map(({ name }) => ({ name, value })))
    }
    if (!options.weak)
      return
    for (const value of values) {
      const dicts = (await this.ctx.model.get('dict.local', {
        values: { $el: `%${value}%` },
        name: { $nin: founds[value].map(found => found.name) },
      }, ['name']))
      founds[value].push(...dicts.map(({ name }) => ({ name, value, weak: true })))
    }
  }
}

namespace LocalDictSource {
  export interface Config {
    bufferSize: number
    encoding: 'ascii' | 'utf8' | 'utf16le'
  }

  export const Config: Schema<Config> = Schema.object({
    bufferSize: Schema.number().default(10000).description('缓冲区大小。'),
    encoding: Schema.union([
      Schema.const('ascii').description('ASCII'),
      Schema.const('utf8').description('UTF-8'),
      Schema.const('utf16le').description('UTF-16LE'),
    ]).default('utf8').description('文本文件编码。'),
  })
}

export default LocalDictSource
