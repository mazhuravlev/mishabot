import { InputMedia } from '@mtcute/node'
import { first } from '../../func.js'
import { BotCommand } from '../types.js'

export const sberDrawCommand: BotCommand =
    ({ tg, sber, update }) =>
    async (prompt) => {
        if (/^нарисуй/i.test(prompt)) {
            await tg.sendTyping(update.chat.id, 'typing')
            const completion = await sber.query(
                prompt,
                {
                    function_call: 'auto',
                },
                true
            )
            const msg = first(completion.choices).message.content
            const match = /<img src="([^"]+)"/.exec(msg)
            if (match) {
                const imageBuffer = await sber.api.getImage(match[1])
                const image = InputMedia.photo(new Uint8Array(imageBuffer), {
                    fileMime: 'image/jpeg',
                })
                const caption = msg.replace(/.*<[^>]+. - /, '')
                await update.replyMedia(image, {
                    caption: caption.charAt(0).toUpperCase() + caption.slice(1),
                })
            } else {
                await update.replyText(msg)
            }
            return true
        } else {
            return false
        }
    }
