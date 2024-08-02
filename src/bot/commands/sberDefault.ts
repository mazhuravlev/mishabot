import { InputMedia, md } from '@mtcute/node'
import { first } from '../../func.js'
import { addRepliedMessageContext, makeFailureMessage } from '../func.js'
import { BotCommand } from '../types.js'

export const sberDefaultCommand =
    (addText?: string): BotCommand =>
    ({ tg, sber, update }) =>
    async (prompt) => {
        await tg.sendTyping(update.chat.id, 'typing')
        await addRepliedMessageContext(tg, sber, update)
        const completion = await sber.query(prompt, {}, true)
        const { content } = first(completion.choices).message
        if (content) {
            if (/^(скажи|спой)/i.test(prompt)) {
                await tg.sendTyping(update.chat.id, 'typing')
                const voice = InputMedia.voice(
                    new Uint8Array(await sber.api.speak(content))
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
