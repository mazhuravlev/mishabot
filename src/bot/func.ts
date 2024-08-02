import { MessageContext } from '@mtcute/dispatcher'
import { TelegramClient } from '@mtcute/node'
import { getRepliedMessage, getUsername } from '../mtcute.js'
import Openai from '../openai/index.js'
import Sber from '../sber/index.js'

export const removeMention = (msg: string) =>
    msg
        .trim()
        .replace(/^\s*@\w+[\s,]*/, '')
        .trim()

export const makeFailureMessage = (e?: string) => {
    return e ? `Не получилось 😢: ${e}` : 'Не получилось 😢'
}

export async function addRepliedMessageContext(
    tg: TelegramClient,
    gpt: Openai.Gpt | Sber.Gpt,
    ctx: MessageContext
) {
    const repliedMessage = await getRepliedMessage(tg, ctx)
    if (repliedMessage) {
        gpt.addUserContext(
            repliedMessage.text,
            getUsername(repliedMessage.sender)
        )
    }
}
