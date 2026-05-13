import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-algebra')

class AlgebraDictSource extends DictSource {
  static name = 'dict-algebra'

  binaryOperators: Record<string, (lhs: string[], rhs: string[]) => string[]> = {
    '-': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
    '+': (lhs, rhs) => lhs.concat(rhs),
    '|': (lhs, rhs) => Array.from(new Set(lhs.concat(rhs))),
    '&': (lhs, rhs) => lhs.filter(item => rhs.includes(item)),
    '^': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
  }

  caches: Map<string, string[]> = new Map()

  cache(name: string, values: string[]) {
    this.caches.set(name, values)
    return values
  }

  override async lookup(name: string) {
    if (this.caches.has(name))
      return this.caches.get(name)!
    if (name.includes(' '))
      return name.split(' ')
    for (const [operator, resolve] of Object.entries(this.binaryOperators)) {
      if (name.includes(operator)) {
        const [lhs, rhs] = name.split(operator, 2)
        logger.debug(`lookup ${name} -> ${lhs} ${operator} ${rhs}`)
        const [lhsValues, rhsValues] = await Promise
          .all([this.ctx.dict.lookup(lhs), this.ctx.dict.lookup(rhs)])
        return this.cache(name, resolve(lhsValues, rhsValues))
      }
    }
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
    return this.cache(`...${parent}`, results.flat())
  }
}

namespace AlgebraDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default AlgebraDictSource
