import type { Context } from 'koishi'

export type Found = Partial<FoundExtras> & { name: string }

export interface FoundExtras {
  weak?: boolean
}

export interface FindOptions {
  weak?: boolean
}

export abstract class DictSource {
  static inject = ['dict']

  constructor(public ctx: Context) {
    this.ctx.dict.register(this)
  }

  async availables(): Promise<Iterable<string>> { return [] }

  // eslint-disable-next-line unused-imports/no-unused-vars
  lookupSync(name: string): string[] { return [] }
  async lookup(name: string): Promise<string[] & { extra?: string }> {
    return this.lookupSync(name)
  }

  async find(
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    for (const name of await this.availables()) {
      if (name.includes('#'))
        continue
      const result = await this.lookup(name) || []
      const collected = options.weak ? result.join(' ') : ''
      for (const value of values) {
        if (result.includes(value))
          (founds[value] ||= []).push({ name })
        else if (options.weak && collected.includes(value))
          (founds[value] ||= []).push({ name, weak: true })
      }
    }
  }
}
