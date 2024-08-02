import { InputMedia } from '@mtcute/node'
import { BotCommand } from '../types.js'
import { getRepliedMessage } from '../../mtcute.js'

export const sberReadCommand: BotCommand =
    ({ tg, sber, update }) =>
    async (prompt) => {
        if (/^прочитай это/i.test(prompt)) {
            const repliedMessage = await getRepliedMessage(tg, update, true)
            if (repliedMessage && repliedMessage.text) {
                await tg.sendTyping(update.chat.id, 'typing')
                const voice = InputMedia.voice(
                    new Uint8Array(await sber.api.speak(repliedMessage.text))
                )
                await update.replyMedia(voice)
            } else {
                await update.replyText('Какое сообщение прочитать?')
            }
            return true
        } else {
            return false
        }
    }
