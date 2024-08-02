import { InputMedia, md } from '@mtcute/node'
import { first } from '../../func.js'
import { getUsername } from '../../mtcute.js'
import { addRepliedMessageContext, makeFailureMessage } from '../func.js'
import { BotCommand } from '../types.js'

export const defaultCommand =
    (addText?: string): BotCommand =>
    ({ tg, gpt, update }) =>
    async (prompt) => {
        await tg.sendTyping(update.chat.id, 'typing')
        await addRepliedMessageContext(tg, gpt, update)
        const { content } = first(
            (await gpt.query(prompt, getUsername(update.sender))).choices
        ).message
        if (content) {
            if (/^(скажи|спой)/i.test(prompt)) {
                await tg.sendTyping(update.chat.id, 'typing')
                const voice = InputMedia.voice(
                    new Uint8Array(await gpt.speak(content))
                )
                await update.replyMedia(voice)
            } else {
                const replyText = addText ? `${content}\n${addText}` : content
                await update.replyText(md(replyText))
            }
        } else {
            await update.replyText(makeFailureMessage())
        }

        return true
    }
