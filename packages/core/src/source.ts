/* eslint-disable unused-imports/no-unused-vars */
import type { Context, Dict } from 'koishi'

export interface Found {
  name: string
  weak?: boolean
}

export abstract class DictSource {
  static inject = ['dict']

  constructor(public ctx: Context) {
    this.ctx.dict.register(this)
  }

  async* availables(options: Dict<any>): AsyncGenerator<string, void, void> {}

  lookupSync(name: string): string[] { return [] }
  async lookup(name: string): Promise<string[] & { extra?: string }> {
    return this.lookupSync(name)
  }

  protected async findFromOne(
    name: string,
    values: string[],
    founds: Record<string, Found[]>,
    options: Dict<any>,
  ) {
    const result = await this.lookup(name) || []
    const collected = options.weak ? result.join(' ') : ''
    for (const value of values) {
      if (result.includes(value))
        founds[value].push({ name })
      else if (options.weak && collected.includes(value))
        founds[value].push({ name, weak: true })
    }
  }

  protected async findFromMany(
    names: string[],
    values: string[],
    founds: Record<string, Found[]>,
    options: Dict<any>,
  ) {
    await Promise.all(names.map(name =>
      this.findFromOne(name, values, founds, options)))
  }

  async findFrom(
    names: string[] | 'availables',
    values: string[],
    founds: Record<string, Found[]>,
    options: Dict<any>,
  ) {
    if (names === 'availables')
      names = await Array.fromAsync(this.availables(options))
    await this.findFromMany(names, values, founds, options)
  }
}
