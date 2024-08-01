import { MessageContext } from '@mtcute/dispatcher'
import Openai from './openai/index.js'
import { assertDefined, assertNonEmptyString, first, last } from './func.js'
import { TelegramClient } from '@mtcute/node'

export const removeMention = (msg: string) =>
    msg
        .trim()
        .replace(/^\s*@\w+[\s,]*/, '')
        .trim()

export const makeFailureMessage = (e?: string) => {
    return e ? `Не получилось 😢: ${e}` : 'Не получилось 😢'
}

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

export async function makeExcerpt(gpt: Openai.Gpt, apply: boolean) {
    const answer = await gpt.exerpt(apply)
    return first(answer.choices).message
}

export async function getRepliedMessage(
    tg: TelegramClient,
    upd: MessageContext,
    includeBotMessage = false
) {
    if (upd.replyToMessage?.id) {
        const originalMessage = assertDefined(
            first(await tg.getMessages(upd.chat.id, [upd.replyToMessage.id]))
        )
        const includeMessage =
            originalMessage.text &&
            (includeBotMessage ||
                originalMessage.sender.username !== (await tg.getMyUsername()))
        if (includeMessage) {
            return originalMessage
        } else {
            return undefined
        }
    } else {
        return undefined
    }
}

const setRoleRegex = /^установи роль[^А-яA-z]*/iu
const drawThisRegex = /^нарисуй это[^А-яA-z]*/iu
const aspectRatioRegex = /\b(\d+\/\d+)\b/gu
export const botStrings = {
    status: {
        test: (s: string) => /^статус/i.test(s),
    },
    setRole: {
        test: (s: string) => setRoleRegex.test(s),
        sanitize: (s: string) => s.replace(setRoleRegex, ''),
    },
    getRole: {
        test: (s: string) => /^[А-я\w]+ роль/iu.test(s),
    },
    look: {
        test: (s: string) => /^глянь\s*,?\s*/i.test(s),
    },
    draw: {
        test: (s: string) => /^нарисуй/i.test(s),
    },
    drawThis: {
        test: (s: string) => drawThisRegex.test(s),
        sanitize: (s: string) => s.replace(drawThisRegex, ''),
    },
    speak: {
        test: (s: string) => /^скажи/i.test(s),
    },
    aspectRatio: {
        get: (s: string) => {
            const aspectMatches = s.match(aspectRatioRegex)
            if (aspectMatches) {
                const [width, height] = last(aspectMatches).split('/')
                assertNonEmptyString(width)
                assertNonEmptyString(height)
                return { width, height }
            }
        },
        sanitize: (s: string) => s.replace(aspectRatioRegex, ''),
    },
    moderation: {
        regex: /модерация\s+/,
        test: (s: string) => botStrings.moderation.regex.test(s),
        sanitize: (s: string) => s.replace(botStrings.moderation.regex, ''),
    },
}
