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

export function toError(e: unknown): Error {
    try {
        return e instanceof Error ? e : new Error(String(e))
    } catch (error) {
        return new Error()
    }
}