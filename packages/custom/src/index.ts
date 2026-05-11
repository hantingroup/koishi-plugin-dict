import type { Context } from 'koishi'
import { opendir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

declare module 'koishi' {
  interface Tables {
    dict: {
      name: string
      values: string[]
    }
  }
}

class CustomDictSource extends DictSource {
  static name = 'dict-custom'
  logger = new Logger('dict-custom')
  static inject = ['dict', 'database']

  availables: Set<string> = new Set()

  constructor(ctx: Context, public config: CustomDictSource.Config) {
    super(ctx)

    ctx.model.extend('dict', {
      name: 'char',
      values: 'list',
    }, { primary: 'name' })

    ctx.command('push [name:string] [...values:string]', '添加字典值。')
      .alias('append', '添加')
      .alias('delete', { options: { remove: true } })
      .alias('remove', { options: { remove: true } })
      .alias('删除', { options: { remove: true } })
      .alias('移除', { options: { remove: true } })
      .option('force', '-f 强制添加。')
      .option('remove', '-r 移除字典值。')
      .option('separator', '-s <sep:string> 分隔符。')
      .example(`\`push <name> <value>\` 添加value到%(<name>)。`)
      .action(async ({ session, options }, name, ...values) => {
        if (!session)
          return

        if (!values.length) {
          if (!options?.remove)
            return `请提供要添加的值。`

          if (!options.force)
            return `如要移除字典 %(${name})，请使用 --force 选项。`

          this.availables.delete(name)
          this.ctx.emit('dict-removed', name)
          await this.ctx.database.remove('dict', { name })
          return `已成功移除字典 %(${name})。`
        }

        let dict = { name, values: [] as string[] }

        if (this.availables.has(name)) {
          [dict] = await ctx.database.get('dict', { name })
        }
        else if (options?.remove) {
          return `字典 %(${name}) 不存在。`
        }

        const success: string[] = []
        const failed: string[] = []

        for (const item of values) {
          const index = dict.values.indexOf(item)
          if (options?.remove) {
            if (index !== -1)
              success.push(dict.values.splice(index, 1)[0])
            else
              failed.push(item)
          }
          else {
            if ((index === -1 && !success.includes(item)) || options?.force)
              success.push(item)
            else
              failed.push(item)
          }
        }

        if (options?.remove) {
          if (success.length)
            await session.send(`移除成功：${success.join(' ')}`)
          if (failed.length)
            await session.send(`移除失败，以下值不存在：${failed.join(' ')}`)
        }
        else {
          if (success.length === 0) {
            return `添加失败：所有值都已存在，您可以使用 --force 选项强制添加。`
          }
          dict.values.push(...success)
          await session.send(`添加成功：${success.join(' ')}`)
          if (failed.length)
            await session.send(`添加失败，以下值已存在：${failed.join(' ')}`)
        }

        await this.ctx.database.upsert('dict', [{ name, values }])
        if (!this.availables.has(name)) {
          this.availables.add(name)
          this.ctx.emit('dict-added', name)
        }
      })

    ctx.on('ready', async () => {
      const dicts = await ctx.database.get('dict', {}, ['name'])
      for (const { name } of dicts)
        this.availables.add(name)
      this.logger.info(`indexed ${this.availables.size} dicts.`)
      ctx.emit('dict-added', ...this.availables.values())
    })

    ctx.on('dispose', () => {
      ctx.emit('dict-removed', ...this.availables.values())
    })
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
        promises.push(this.ctx.database.upsert('dict', [{ name, values }]))
      }
    }
    await Promise.all(promises)
  }

  override async lookup(name: string): Promise<string[]> {
    if (!this.availables.has(name))
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
