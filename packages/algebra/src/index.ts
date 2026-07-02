import { Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

class AlgebraDictSource extends DictSource {
  static name = 'dict-algebra'

  cache: Map<string, string[]> = new Map()
  lrus: string[] = [] // TODO: queue

  binaryOperators: Record<string, (lhs: string[], rhs: string[]) => string[]> = {
    '-': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
    '+': (lhs, rhs) => lhs.concat(rhs),
    '|': (lhs, rhs) => Array.from(new Set(lhs.concat(rhs))),
    '&': (lhs, rhs) => lhs.filter(item => rhs.includes(item)),
    '^': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
  }

  cached(name: string, values: string[]) {
    if (this.ctx.config.maxCacheSize) {
      this.lrus.push(name)
      this.cache.set(name, values)
      if (this.cache.size > this.ctx.config.maxCacheSize)
        this.cache.delete(this.lrus.shift()!)
    }
    return values
  }

  override async lookup(name: string) {
    if (this.ctx.config.maxCacheSize && this.cache.has(name))
      return this.cache.get(name)!

    // space-separated names
    if (name.includes(' '))
      return name.split(' ')

    // operators: -, +, |, &, ^
    for (const [operator, resolve] of Object.entries(this.binaryOperators)) {
      if (name.includes(operator)) {
        const [lhs, rhs] = name.split(operator, 2)
        this.ctx.logger.debug(`lookup ${name} -> ${lhs} ${operator} ${rhs}`)
        const [lhsValues, rhsValues] = await Promise
          .all([this.ctx.dict.lookup(lhs), this.ctx.dict.lookup(rhs)])
        return this.cached(name, resolve(lhsValues, rhsValues))
      }
    }

    /// recursive lookup
    if (name.startsWith('...'))
      return await this.lookupRecursive(name.slice(3))

    return []
  }

  async lookupRecursive(parent: string): Promise<string[]> {
    const children = await this.ctx.dict.lookup(parent)
    if (!children.length)
      return [this.ctx.dict.split(parent).pop()!]
    const results = await Promise.all(children.map(child =>
      this.lookupRecursive(this.ctx.dict.join(parent, child))))
    return this.cached(`...${parent}`, results.flat())
  }
}

namespace AlgebraDictSource {
  export interface Config {
    maxCacheSize: number
  }

  export const Config: Schema<Config> = Schema.object({
    maxCacheSize: Schema.number().default(10000).description('缓存大小。'),
  })
}

export default AlgebraDictSource
