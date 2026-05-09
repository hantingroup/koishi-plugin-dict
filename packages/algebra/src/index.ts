import { Logger, Schema } from 'koishi'
import { DictSource } from 'koishi-plugin-dict'

const logger = new Logger('dict-algebra')

class AlgebraDictSource extends DictSource {
  binaryOperators: Record<string, (lhs: string[], rhs: string[]) => string[]> = {
    '-': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
    '+': (lhs, rhs) => lhs.concat(rhs),
    '|': (lhs, rhs) => Array.from(new Set(lhs.concat(rhs))),
    '&': (lhs, rhs) => lhs.filter(item => rhs.includes(item)),
    '^': (lhs, rhs) => lhs.filter(item => !rhs.includes(item)),
  }

  override async lookup(key: string) {
    for (const operator of Object.keys(this.binaryOperators)) {
      if (key.includes(operator)) {
        const [lhs, rhs] = key.split(operator, 2)
        logger.debug(`lookup ${key} -> ${lhs} ${operator} ${rhs}`)
        return this.binaryOperators[operator](
          ...await Promise.all([
            this.ctx.dict.lookup(lhs),
            this.ctx.dict.lookup(rhs),
          ]),
        )
      }
    }
    return []
  }
}

namespace AlgebraDictSource {
  export interface Config {}
  export const Config: Schema<Config> = Schema.object({})
}

export default AlgebraDictSource
