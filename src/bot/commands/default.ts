import { InputMedia, md } from '@mtcute/node'
import { first } from '../../func.js'
import { getUsername } from '../../mtcute.js'
import { addRepliedMessageContext, makeFailureMessage } from '../func.js'
import { BotCommand } from '../types.js'

export const defaultCommand: BotCommand =
    ({ tg, gpt, update }) =>
    async (prompt) => {
        await tg.sendTyping(update.chat.id, 'typing')
        await addRepliedMessageContext(tg, gpt, update)
        const { content } = first(
            (await gpt.query(prompt, getUsername(update.sender))).choices
        ).message
        if (content) {
            if (/^скажи/i.test(prompt)) {
                await tg.sendTyping(update.chat.id, 'typing')
                const voice = InputMedia.voice(
                    new Uint8Array(await gpt.speak(content))
                )
                await update.replyMedia(voice)
            } else {
                await update.answerText(md(content))
            }
        } else {
            await update.replyText(makeFailureMessage())
        }

        return true
    }
