import { UpdateFilter, MessageContext } from '@mtcute/dispatcher'
import { Peer, TelegramClient } from '@mtcute/node'
import { assertDefined, first } from './func.js'
import Openai from './openai/index.js'
import OpenAI from 'openai'
import { ChatLogRecord } from './openai/types.js'

export const getChatId = (msg: MessageContext): string => {
    const getTopicId = (msg: MessageContext): number | undefined => {
        if (msg.raw._ !== 'message') return
        const { replyTo } = msg.raw
        if (
            replyTo &&
            replyTo._ === 'messageReplyHeader' &&
            replyTo.forumTopic
        ) {
            return replyTo.replyToTopId ?? replyTo.replyToMsgId
        }
    }
    const chatId = msg.chat.id
    const topicId = getTopicId(msg)
    return topicId ? `${chatId}_${topicId}` : chatId.toFixed()
}

export const makeIsAllowedMsg: (
    tg: TelegramClient
) => UpdateFilter<MessageContext> =
    (tg) =>
    async (msg: MessageContext): Promise<boolean> => {
        const { chat, isMention, replyToMessage } = msg
        if (msg.sender.username?.includes('_bot')) return false
        if (isMention || chat.chatType === 'private') {
            return true
        } else if (replyToMessage?.id) {
            const originalMessage = assertDefined(
                (await tg.getMessages(chat.id, [replyToMessage.id]))[0]
            )
            return (
                originalMessage.sender.username === (await tg.getMyUsername())
            )
        } else {
            return false
        }
    }

export async function getMessagePhoto(tg: TelegramClient, msg: MessageContext) {
    if (msg.replyToMessage?.id) {
        const repliedMsg = assertDefined(
            (await tg.getMessages(msg.chat.id, [msg.replyToMessage.id]))[0]
        )
        return repliedMsg.media?.type === 'photo' ? repliedMsg.media : undefined
    } else {
        return msg.media?.type === 'photo' ? msg.media : undefined
    }
}

export async function getMessageText(
    tg: TelegramClient,
    gpt: Openai.Gpt,
    upd: MessageContext
) {
    if (upd.media?.type === 'voice') {
        const buffer = await tg.downloadAsBuffer(upd.media)
        return await gpt.transcribe(buffer)
    } else {
        return upd.text
    }
}

export const getUsername = (peer: Peer) => peer.username ?? undefined

export function toChatLog(completion: OpenAI.Chat.Completions.ChatCompletion) {
    const c = first(completion.choices)
    const { role, content } = c.message
    if (content) {
        return {
            map: (f: (x: ChatLogRecord) => void) =>
                f({
                    role,
                    content,
                }),
        }
    }
}
