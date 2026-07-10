import type { Context } from 'koishi'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-tree')

declare module 'koishi-plugin-dict' {
  interface FindOptions {
    depth?: number
  }
}

class TreeNode {
  type?: string
  children: Map<string, TreeNode> | string[] = []

  async* entries({ depth = 1 }: { depth?: number }): AsyncGenerator<string> {
    if (!this.children)
      return
    if (Array.isArray(this.children)) {
      yield* this.children
      return
    }
    for (const [key, child] of this.children.entries()) {
      yield key
      if (depth > 1)
        yield* child.entries({ depth: depth - 1 })
    }
  }

  static async fromDirent(dirent: Dirent) {
    const node = new TreeNode()
    const name = await node.loadDirent(dirent)
    return [name, node] as const
  }

  async loadDirent(dirent: Dirent) {
    const fullPath = resolve(dirent.parentPath, dirent.name)

    if (dirent.isDirectory()) {
      const dirents = await readdir(fullPath, { withFileTypes: true })
      const promises = dirents.map(dirent => TreeNode.fromDirent(dirent))
      this.children = new Map(await Promise.all(promises))
      return dirent.name
    }

    if (dirent.name.endsWith('.json')) {
      const content = await readFile(fullPath)
      this.loadObject(JSON.parse(content.toString()))
      return dirent.name.replace(/\..+$/, '')
    }

    throw new Error(`unknown format: ${fullPath}`)
  }

  static fromObject(data: any, name = '') {
    const node = new TreeNode()
    name = node.loadObject(data, name)
    return [name, node] as const
  }

  loadObject(data: any, name = '') {
    if (typeof data === 'string') {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      this.children = lines.length > 1 ? lines : Array.from(lines[0].trim())
    }
    else if (Array.isArray(data)) {
      if (data.every(item => typeof item === 'string'))
        this.children = data
      else
        this.children = new Map(data.map((child: any) => TreeNode.fromObject(child)))
    }
    else if (typeof data === 'object' && data !== null) {
      if (typeof data.name === 'string') {
        name = data.name
        if (typeof data.type === 'string')
          this.type = data.type
        if (Array.isArray(data.children)) {
          this.children = new Map(data.children
            .map((child: any) => TreeNode.fromObject(child)))
        }
      }
      else {
        this.children = new Map(Object.entries(data)
          .map(([key, value]) => TreeNode.fromObject(value, key)))
      }
    }
    else {
      logger.warn(`unknown format: %o`, data)
    }
    return name
  }
}

class TreeDictSource extends DictSource {
  static name = 'dict-tree'
  static inject = ['dict', 'database']

  root: TreeNode = new TreeNode()
  entries = this.root.entries.bind(this.root)

  constructor(ctx: Context, public config: TreeDictSource.Config) {
    super(ctx)

    ctx.on('ready', async () => {
      const baseDir = resolve(ctx.baseDir, 'data', 'dicts', 'trees')
      await mkdir(baseDir, { recursive: true })
      const dirents = await readdir(baseDir, { withFileTypes: true })
      const promises = dirents.map(dirent => TreeNode.fromDirent(dirent))
      this.root.children = new Map(await Promise.all(promises))
      ctx.logger.info(`indexed ${this.root.children.size} dicts`)
    })
  }

  override async lookup(name: string) {
    const path = name.split('/')
    let current = this.root
    for (const part of path) {
      if (!(current?.children instanceof Map))
        return []
      current = current.children.get(part)!
      if (!current)
        return []
    }
    return current.children instanceof Map
      ? Array.from(current.children.keys())
      : current.children
  }
}

namespace TreeDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default TreeDictSource
