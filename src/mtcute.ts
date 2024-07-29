import { UpdateFilter, MessageContext } from "@mtcute/dispatcher"
import { removeMention } from "./bot.js"
import { InputMediaLike, Message, Photo, TelegramClient } from "@mtcute/node"
import { assertDefined, first } from "./func.js"
import { ChatGpt } from "./chatGpt.js"

export const regexFilter = (regex: RegExp): UpdateFilter<MessageContext> =>
    async (msg: MessageContext): Promise<boolean> => {
        return regex.test(removeMention(msg.text))
    }

export const getChatId = (msg: MessageContext): string => {
    const getTopicId = (msg: MessageContext): number | undefined => {
        if (msg.raw._ !== 'message') return
        const { replyTo } = msg.raw
        if (replyTo && replyTo._ === 'messageReplyHeader' && replyTo.forumTopic) {
            return replyTo.replyToTopId ?? replyTo.replyToMsgId
        }
    }
    const chatId = msg.chat.id
    const topicId = getTopicId(msg)
    return topicId ? `${chatId}_${topicId}` : chatId.toFixed()
}

export const makeUpdateMessage = (tg: TelegramClient) =>
    (msg: Message) =>
        (text?: string, media?: InputMediaLike) =>
            tg.editMessage({ chatId: msg.chat.id, message: msg.id, text })

export const makeIsAllowedMsg: (tg: TelegramClient) => UpdateFilter<MessageContext> =
    (tg) => async (msg: MessageContext): Promise<boolean> => {
        const { chat, isMention, replyToMessage } = msg
        if (msg.sender.username?.includes('_bot')) return false
        if (isMention || chat.chatType === 'private') {
            return true
        } else if (replyToMessage?.id) {
            const originalMessage = assertDefined((await tg.getMessages(chat.id, [replyToMessage.id]))[0])
            return originalMessage.sender.username === await tg.getMyUsername()
        } else {
            return false
        }
    }

export async function getMessagePhoto(tg: TelegramClient, msg: MessageContext) {
    if (msg.replyToMessage?.id) {
        const repliedMsg = assertDefined((await tg.getMessages(msg.chat.id, [msg.replyToMessage.id]))[0])
        return repliedMsg.media?.type === 'photo' ? repliedMsg.media as Photo : undefined
    } else {
        return msg.media?.type === 'photo' ? msg.media as Photo : undefined
    }
}

export async function getMessageText(tg: TelegramClient, gpt: ChatGpt, upd: MessageContext) {
    if (upd.media?.type === 'voice') {
        const buffer = await tg.downloadAsBuffer(upd.media)
        return await gpt.transcribe(buffer)
    } else {
        return upd.text
    }
}