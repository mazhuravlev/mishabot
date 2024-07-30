import { MessageContext } from "@mtcute/dispatcher"
import { ChatGpt } from "./chatGpt.js"
import { assertDefined, first } from "./func.js"
import { TelegramClient } from "@mtcute/node"

export const removeMention = (msg: string) => msg.trim().replace(/^\s*@\w+[\s,]*/, '').trim()

export const makeFailureMessage = (e?: string) => {
    return e ? 'Не получилось 😢' : `Не получилось 😢: ${e}`
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

export async function makeExcerpt(gpt: ChatGpt, apply: boolean) {
    const answer = await gpt.exerpt(apply)
    return first(answer.choices).message
}

export async function getRepliedMessage(tg: TelegramClient, upd: MessageContext, includeBotMessage = false) {
    if (upd.replyToMessage?.id) {
        const originalMessage = assertDefined(first(await tg.getMessages(upd.chat.id, [upd.replyToMessage.id])))
        const includeMessage = originalMessage.text && (includeBotMessage || (originalMessage.sender.username !== await tg.getMyUsername()))
        if (includeMessage) {
            return originalMessage
        } else {
            return undefined
        }
    } else {
        return undefined
    }
}