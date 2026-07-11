import type { Context } from 'koishi'
import type { FindOptions } from 'koishi-plugin-dict'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pick, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

type TreeNode = Map<string, TreeNode | string[]>

async function fromDirent(dirent: Dirent): Promise<[string, TreeNode | string[]]> {
  const fullPath = resolve(dirent.parentPath, dirent.name)

  if (dirent.isDirectory()) {
    const dirents = await readdir(fullPath, { withFileTypes: true })
    const promises = dirents.map(dirent => fromDirent(dirent))
    return [dirent.name, new Map(await Promise.all(promises))]
  }

  if (dirent.name.endsWith('.json')) {
    const content = await readFile(fullPath)
    const data = JSON.parse(content.toString())
    return [dirent.name.replace(/\..+$/, ''), fromObject(data)]
  }

  throw new Error(`unknown format: ${fullPath}`)
}

function fromObject(data: any): TreeNode | string[] {
  if (typeof data === 'string') {
    const lines = data.split('\n').filter(line => line.trim() !== '')
    return lines.length > 1 ? lines : Array.from(lines[0].trim())
  }
  if (Array.isArray(data)) {
    // eslint-disable-next-line style/multiline-ternary
    return data.every(item => typeof item === 'string') ? data
      : new Map(data.map((child: any) => [child.name, fromObject(child)]))
  }
  if (typeof data === 'object' && data !== null) {
    if (typeof data.name === 'string') {
      let children: any[] = []
      Array.isArray(data.children) && (children = data.children)
      const node = new Map(children.map(child => [child.name, fromObject(child)]))
      return Object.assign(node, pick(data, ['type']))
    }
    return new Map(Object.entries(data)
      .map(([key, value]) => [key, fromObject(value)]))
  }
  throw new Error(`unknown format: ${data}`)
}

declare module 'koishi-plugin-dict' {
  interface FindOptions {
    depth?: number
  }
}
class TreeDictSource extends DictSource {
  static name = 'dict-tree'
  static inject = ['dict', 'database']

  root: TreeNode = new Map()

  override async* entries(options: FindOptions & {
    node?: TreeNode
    path?: string[]
  }): AsyncGenerator<string> {
    const depth = options.depth || 1
    const node = options.node || this.root
    const path = options.path || []

    for (const [name, value] of node.entries()) {
      path.push(name)
      yield path.join(this.config.separator)
      if (depth > path.length && value instanceof Map)
        yield* this.entries({ ...options, node: value, path, depth })
      path.pop()
    }
  }

  constructor(ctx: Context, public config: TreeDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const baseDir = resolve(ctx.baseDir, 'data', 'dicts', 'trees')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      const promises = dirents.map(dirent => fromDirent(dirent))
      this.root = new Map(await Promise.all(promises))
      ctx.logger.info(`loaded ${this.root.size} dicts`)
    })
  }

  override async lookup(name: string) {
    const path = name.split(this.config.separator)
    const final = path.pop()!
    let node: TreeNode = this.root
    for (const part of path) {
      const child = node.get(part)
      if (child instanceof Map)
        node = child
      else
        return []
    }
    const result = node.get(final)
    return result
      ? result instanceof Map
        ? Array.from(result.keys())
        : result
      : []
  }
}

namespace TreeDictSource {
  export interface Config {
    separator: string
  }

  export const Config: Schema<Config> = Schema.object({
    separator: Schema.string().default('/').description('层级字典分隔符。'),
  })
}

export default TreeDictSource
