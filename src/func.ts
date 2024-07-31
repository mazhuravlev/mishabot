export const assertDefined = <T>(x: T | undefined | null): T => {
    if (x) return x
    throw new Error('assertDefined')
}

export const first = <T>(list: T[]): T => {
    if (list.length > 0) return list[0]
    throw new Error('first: empty list')
}

export const toError = (e: unknown): Error => {
    try {
        return e instanceof Error ? e : new Error(String(e))
    } catch (error) {
        return new Error()
    }
}

export const unixTimestamp = (date = Date.now()) => Math.floor(date / 1000)

export const resToJson = (res: Response) => res.json()

export const not = (x: unknown): boolean => !x

export const last = <T>(array: T[]) => {
    if (array.length === 0) throw new Error('last: empty array')
    return array[array.length - 1]
}

export const assertNonEmptyString = (s: unknown) => {
    if (typeof s !== 'string' || s.length === 0) throw new Error('assertNonEmptyString')
}

/**
 * Add code backticks for Telegram
 * @param s input string
 * @returns 
 */
export const cb = (s: string) => '```\n' + s + '```'