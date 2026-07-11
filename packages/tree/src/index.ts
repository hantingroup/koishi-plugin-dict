import type { Context } from 'koishi'
import type { FindOptions } from 'koishi-plugin-dict'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pick, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

declare module 'koishi-plugin-dict' {
  interface FindOptions {
    depth?: number
  }
}

class Node extends Map<string, Node | string[]> {
  async* entriesRecursive(depth: number): AsyncGenerator<string> {
    for (const [key, child] of this.entries()) {
      yield key
      if (child instanceof Node && depth > 1)
        yield* child.entriesRecursive(depth - 1)
    }
  }

  static async fromDirent(dirent: Dirent): Promise<[string, Node | string[]]> {
    const fullPath = resolve(dirent.parentPath, dirent.name)

    if (dirent.isDirectory()) {
      const dirents = await readdir(fullPath, { withFileTypes: true })
      const promises = dirents.map(dirent => Node.fromDirent(dirent))
      return [dirent.name, new Node(await Promise.all(promises))]
    }

    if (dirent.name.endsWith('.json')) {
      const content = await readFile(fullPath)
      const data = JSON.parse(content.toString())
      return Node.fromObject(data, dirent.name.replace(/\..+$/, ''))
    }

    throw new Error(`unknown format: ${fullPath}`)
  }

  static fromObject(data: any, name = ''): [string, Node | string[]] {
    if (typeof data === 'string') {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      return [name, lines.length > 1 ? lines : Array.from(lines[0].trim())]
    }
    if (Array.isArray(data)) {
      // eslint-disable-next-line style/multiline-ternary
      return [name, data.every(item => typeof item === 'string') ? data
        : new Node(data.map((child: any) => Node.fromObject(child)))]
    }
    if (typeof data === 'object' && data !== null) {
      if (typeof data.name === 'string') {
        let children: any[] = []
        Array.isArray(data.children) && (children = data.children)
        const node = new Node(children.map(child => Node.fromObject(child)))
        return [data.name, Object.assign(node, pick(data, ['type']))]
      }
      return [name, new Node(Object.entries(data)
        .map(([key, value]) => Node.fromObject(value, key)))]
    }
    throw new Error(`unknown format: ${data}`)
  }
}

class TreeDictSource extends DictSource {
  static name = 'dict-tree'
  static inject = ['dict', 'database']

  root: Node = new Node()
  entries(options: FindOptions) {
    return this.root.entriesRecursive(options.depth || 1)
  }

  constructor(ctx: Context, public config: TreeDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const baseDir = resolve(ctx.baseDir, 'data', 'dicts', 'trees')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      const promises = dirents.map(dirent => Node.fromDirent(dirent))
      this.root = new Node(await Promise.all(promises))
      ctx.logger.info(`loaded ${this.root.size} dicts`)
    })
  }

  override async lookup(name: string) {
    const path = name.split('/')
    const final = path.pop()!
    let node: Node = this.root
    for (const part of path) {
      const child = node.get(part)
      if (child instanceof Node)
        node = child
      else
        return []
    }
    const result = node.get(final)
    return result
      ? result instanceof Node
        ? Array.from(result.keys())
        : result
      : []
  }
}

namespace TreeDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default TreeDictSource
