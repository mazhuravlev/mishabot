import { UpdateFilter, MessageContext } from "@mtcute/dispatcher"

export const parseRoleCmd = (msg: string) => {
    const m = /^роль\s*([?:])\s*(.*)/i.exec(msg)
    if (m) {
        const cmd = m[1].trim()
        if (cmd === ':') {
            return { cmd: 'set' as const, role: m[2].trim() }
        } else if (cmd === '?') {
            return { cmd: 'get' as const }
        } else {
            return false
        }
    } else {
        return false
    }
}

export const assertDefined = <T>(x: T | undefined | null): T => {
    if (x) return x
    throw 'assertDefined'
}

export const first = <T>(list: T[]): T => {
    if (list.length > 0) return list[0]
    throw 'first: empty list'
}

export function toError(e: unknown): Error {
    try {
        return e instanceof Error ? e : new Error(String(e))
    } catch (error) {
        return new Error()
    }
}

export const removeMention = (msg: string) => msg.trim().replace(/^\s*@\w+[\s,]*/, '').trim()

export const regexFilter = (regex: RegExp): UpdateFilter<MessageContext> => async (msg: MessageContext): Promise<boolean> => {
    return regex.test(removeMention(msg.text))
}
