import { MessageContext } from '@mtcute/dispatcher'
import { InputMedia, md, TelegramClient } from '@mtcute/node'
import Openai from './openai/index.js'
import Yandex from './yandex/index.js'
import {
    assertDefined,
    assertNonEmptyString,
    cb,
    first,
    last,
    toError,
} from './func.js'
import { getMessagePhoto, getUsername } from './mtcute.js'
import { getRepliedMessage, makeFailureMessage } from './bot.js'
import sharp from 'sharp'

export interface BotContext {
    update: MessageContext
    tg: TelegramClient
    gpt: Openai.Gpt
    yandex: Yandex.Gpt
}

export type BotCommandExec = (prompt: string) => Promise<boolean>
export type BotCommand = (ctx: BotContext) => BotCommandExec

export const statusCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        if (/^статус/i.test(prompt)) {
            await update.answerText(md(cb(JSON.stringify(gpt.usage, null, 2))))
            return true
        } else {
            return false
        }
    }

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

export const roleCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        const setRoleRegex = /^установи роль[^А-яA-z]*/iu
        if (setRoleRegex.test(prompt)) {
            const role = prompt.replace(setRoleRegex, '')
            if (role) {
                gpt.role = role
                await update.answerText(role)
            } else {
                await update.answerText('Какую роль установить?')
            }
            return true
        } else if (/^[А-я\w]+ роль/iu.test(prompt)) {
            await update.answerText(gpt.role)
            return true
        } else {
            return false
        }
    }

export const moderationCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        const regex = /модерация\s+/
        if (regex.test(prompt)) {
            await update.answerText(
                md(
                    cb(
                        JSON.stringify(
                            await gpt.moderation(prompt.replace(regex, ''))
                        )
                    )
                )
            )
            return true
        } else {
            return false
        }
    }

export const lookCommand: (url: string) => BotCommand =
    (url) =>
    ({ tg, gpt, update }) =>
    async (prompt) => {
        const doLook = async () => {
            const photo = await getMessagePhoto(tg, update)
            if (photo) {
                const filename = photo.fileId + '.jpg'
                const imgPath = (f: string) => `files/${f}`
                await tg.downloadToFile(imgPath(filename), photo)
                await sharp(imgPath(filename))
                    .resize(512, 512)
                    .toFile(imgPath(`512_${filename}`))
                const imageResponse = await gpt.lookAtImage(
                    prompt,
                    `${url}/512_${filename}`
                )
                return (
                    first(imageResponse.choices).message.content ??
                    makeFailureMessage()
                )
            } else {
                return `Нечего глядеть ${Math.random() > 0.5 ? '🧐' : '🤔'}?`
            }
        }
        if (/^глянь\s*,?\s*/iu.test(prompt)) {
            await tg.sendTyping(update.chat.id, 'typing')
            await addRepliedMessageContext(tg, gpt, update)
            const waitMessageP = update.replyText('Щас гляну!')
            const result = await doLook()
            await tg.editMessage({
                chatId: update.chat.id,
                message: (await waitMessageP).id,
                text: result,
            })
            return true
        } else {
            return false
        }
    }

export const drawCommand: BotCommand =
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
                    await update.answerText('Что именно требуется нарисовать?')
                }
            } else {
                await doDraw(update, prompt, gpt)
            }
            return true
        } else {
            return false
        }
    }

export const noopCommand: BotCommand = () => () => Promise.resolve(false)

async function addRepliedMessageContext(
    tg: TelegramClient,
    gpt: Openai.Gpt,
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

class AspectRatio {
    private _aspectRatioRegex = /\b(\d+\/\d+)\b/gu

    constructor(private _str: string) {}

    public get value() {
        const aspectMatches = this._str.match(this._aspectRatioRegex)
        if (aspectMatches) {
            const [width, height] = last(aspectMatches).split('/')
            assertNonEmptyString(width)
            assertNonEmptyString(height)
            return { width, height }
        } else {
            return { width: '1', height: '1' }
        }
    }

    public get sanitized() {
        return this._str.replace(this._aspectRatioRegex, '')
    }
}
