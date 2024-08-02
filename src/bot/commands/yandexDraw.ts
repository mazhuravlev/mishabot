import { MessageContext } from '@mtcute/dispatcher'
import { InputMedia } from '@mtcute/node'
import { assertDefined, toError } from '../../func.js'
import { getUsername, getRepliedMessage } from '../../mtcute.js'
import Openai from '../../openai/index.js'
import { makeFailureMessage } from '../func.js'
import { BotCommand } from '../types.js'
import { AspectRatio } from './aspectRatio.js'

export const yandexDrawCommand: BotCommand =
    ({ tg, gpt, update, yandex }) =>
    async (prompt) => {
        if (/^нарисуй/i.test(prompt)) {
            async function doDraw(
                ctx: MessageContext,
                prompt: string,
                gpt: Openai.Gpt
            ) {
                const waitMessageP = ctx.replyText('Щас нарисую!')
                const updateMessage = async (text: string) =>
                    tg.editMessage({
                        chatId: update.chat.id,
                        message: (await waitMessageP).id,
                        text,
                    })
                const aspectRatio = new AspectRatio(prompt)
                const img = await yandex.drawImage(
                    aspectRatio.sanitized,
                    aspectRatio.value.width,
                    aspectRatio.value.height
                )
                img.subscribe({
                    next: async (o): Promise<void> => {
                        if (o.done) {
                            await tg.deleteMessages([await waitMessageP])
                            const image = InputMedia.photo(
                                Buffer.from(assertDefined(o.image), 'base64'),
                                { fileMime: 'image/jpeg' }
                            )
                            await ctx.replyMedia(image, { caption: prompt })
                            gpt.addUserContext(prompt, getUsername(ctx.sender))
                        } else {
                            await updateMessage(`Рисую ${o.i}`)
                        }
                    },
                    error: async (e) => {
                        await updateMessage(
                            makeFailureMessage(toError(e).message)
                        )
                    },
                })
            }
            await tg.sendTyping(update.chat.id, 'typing')
            const drawThisRegex = /^нарисуй это[^А-яA-z]*/iu
            if (drawThisRegex.test(prompt)) {
                const repliedMessage = await getRepliedMessage(tg, update, true)
                if (repliedMessage?.text) {
                    await doDraw(
                        update,
                        [repliedMessage.text, prompt.replace(drawThisRegex, '')]
                            .filter((x) => x.length > 0)
                            .join(', '),
                        gpt
                    )
                } else {
                    await update.replyText('Что именно требуется нарисовать?')
                }
            } else {
                await doDraw(update, prompt, gpt)
            }
            return true
        } else {
            return false
        }
    }
