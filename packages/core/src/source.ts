import type { Context } from 'koishi'

export interface Found {
  name: string
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

  async* availables(): AsyncGenerator<string, void, void> {}

  // eslint-disable-next-line unused-imports/no-unused-vars
  lookupSync(name: string): string[] { return [] }
  async lookup(name: string): Promise<string[] & { extra?: string }> {
    return this.lookupSync(name)
  }

  async findFromOne(
    name: string,
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
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

  async findFromMany(
    names: string[],
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    await Promise.all(names.map(name =>
      this.findFromOne(name, values, founds, options)))
  }

  async findFrom(
    names: string[] | 'availables',
    values: string[],
    founds: Record<string, Found[]>,
    options: FindOptions,
  ) {
    if (names === 'availables')
      names = await Array.fromAsync(this.availables())
    await this.findFromMany(names, values, founds, options)
  }
}
