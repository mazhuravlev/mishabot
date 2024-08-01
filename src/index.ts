import { Dispatcher, MessageContext } from '@mtcute/dispatcher'
import { InputMedia, md, TelegramClient } from '@mtcute/node'
import * as ngrok from 'ngrok'
import Koa from 'koa'
import serve from 'koa-static'
import env from './env.js'
import sharp from 'sharp'
import { assertDefined, cb, first, not, toError } from './func.js'
import { getRepliedMessage, makeFailureMessage, removeMention, botStrings } from './bot.js'
import { getChatId, makeUpdateMessage as _makeUpdateMessage, makeIsAllowedMsg, getMessagePhoto, getMessageText, getUsername } from './mtcute.js'
import { ChatGpt } from './chatGpt.js'
import { Logger } from "tslog"
import { AppLogger } from './types.js'
import Yandex from './yandex/index.js'

const log: AppLogger = new Logger()

const app = new Koa()
app.use(serve('files', {}))
app.listen(8080)
const url = await ngrok.connect({ proto: 'http', addr: 8080 });

const tg = new TelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: 'bot-data/session',
    updates: {
        catchUp: false,
        messageGroupingInterval: 250,
    },
})
const makeUpdateMessage = _makeUpdateMessage(tg)

const yandexAuth = new Yandex.Auth(log)
const yandexGptPool = new Map<string, Yandex.Gpt>()
const getYandexGpt = (msg: MessageContext) => {
    const id = getChatId(msg)
    const yandexGpt = yandexGptPool.get(id)
    if (yandexGpt) {
        return yandexGpt
    } else {
        const newYandexGpt = new Yandex.Gpt(id, env.YANDEX_FOLDER_ID, () => yandexAuth.iamToken, 'yandexgpt')
        yandexGptPool.set(id, newYandexGpt)
        log.info(`Add new YandexGPT '${newYandexGpt.model}' for chat id ${id}`)
        return newYandexGpt
    }
}

const gptPool = new Map<string, ChatGpt>()
const getChatGpt = (msg: MessageContext, chatId: string) => {
    const chatGpt = gptPool.get(chatId)
    if (chatGpt) {
        return chatGpt
    } else {
        const newChatGpt = new ChatGpt(chatId, log, env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.GPT_DEFAULT_SYSTEM_ROLE)
        gptPool.set(chatId, newChatGpt)
        log.info(`Add new ChatGpt for chat id ${chatId}`)
        return newChatGpt
    }
}

const dp = Dispatcher.for(tg)
const isAllowedMsg = makeIsAllowedMsg(tg)

dp.onMessageGroup(
    isAllowedMsg,
    async (upd) => {
        await upd.replyText('Ого, вот это да!')
    })

dp.onNewMessage(
    isAllowedMsg,
    async (ctx: MessageContext) => {
        const chatId = getChatId(ctx)
        log.debug('UPD', chatId, ctx.sender.username, ctx.media?.type ?? 'none', ctx.text)
        const gpt = getChatGpt(ctx, chatId)
        const prompt = removeMention(await getMessageText(tg, gpt, ctx))
        if (prompt === '') return
        if (botStrings.status.test(prompt)) {
            await ctx.answerText(md(cb(JSON.stringify(gpt.usage, null, 2))))
        } else if (botStrings.setRole.test(prompt)) {
            gpt.role = botStrings.setRole.sanitize(prompt)
            await ctx.answerText(gpt.role)
        } else if (botStrings.getRole.test(prompt)) {
            await ctx.answerText(gpt.role)
        } else if (botStrings.look.test(prompt)) {
            if (not(env.IMAGE_RECOGNITION)) {
                await ctx.replyText('Нет')
                return
            } else {
                await tg.sendTyping(ctx.chat.id, 'typing')
                await addRepliedMessageContext()
                const waitMessageP = ctx.replyText('Щас гляну!')
                const result = await doLook(gpt, ctx, prompt)
                await makeUpdateMessage(await waitMessageP)(result)
            }
        } else if (botStrings.draw.test(prompt)) {
            await tg.sendTyping(ctx.chat.id, 'typing')
            if (botStrings.drawThis.test(prompt)) {
                const repliedMessage = await getRepliedMessage(tg, ctx, true)
                if (repliedMessage?.text) {
                    await doDraw(ctx,
                        [
                            repliedMessage.text,
                            botStrings.drawThis.sanitize(prompt)
                        ]
                            .filter(x => x.length > 0)
                            .join(', '),
                        gpt)
                } else {
                    await ctx.answerText('Что именно требуется нарисовать?')
                }
            } else {
                await doDraw(ctx, prompt, gpt)
            }
        } else {
            await tg.sendTyping(ctx.chat.id, 'typing')
            await addRepliedMessageContext()
            const { content } = first((await gpt.query(prompt, getUsername(ctx.sender))).choices).message
            if (content) {
                if (botStrings.speak.test(prompt)) {
                    await tg.sendTyping(ctx.chat.id, 'typing')
                    const voice = InputMedia.voice(new Uint8Array(await gpt.speak(content)))
                    await ctx.replyMedia(voice)
                } else {
                    await ctx.answerText(md(content))
                }
            } else {
                await ctx.replyText(makeFailureMessage())
            }
        }

        async function addRepliedMessageContext() {
            const repliedMessage = await getRepliedMessage(tg, ctx)
            if (repliedMessage) {
                gpt.addUserContext(repliedMessage.text, getUsername(repliedMessage.sender))
            }
        }
    })

tg.run({
    phone: () => tg.input('Phone > '),
    code: () => tg.input('Code > '),
    password: () => tg.input('Password > '),
}, (self) => {
    console.log(`Logged in as ${self.username}`)
})

async function doDraw(ctx: MessageContext, prompt: string, gpt: ChatGpt) {
    const waitMessage = await ctx.replyText('Щас нарисую!')
    const updateMessage = makeUpdateMessage(waitMessage)
    const yGpt = getYandexGpt(ctx)
    const aspectRatio = botStrings.aspectRatio.get(ctx.text)
    const img = await yGpt.image(
        botStrings.aspectRatio.sanitize(ctx.text),
        aspectRatio?.width ?? '1',
        aspectRatio?.height ?? '1'
    )
    img.subscribe({
        next: async (o): Promise<void> => {
            if (o.done) {
                await tg.deleteMessages([waitMessage])
                const image = InputMedia.photo(
                    Buffer.from(assertDefined(o.image), 'base64'),
                    { fileMime: 'image/jpeg' })
                await ctx.replyMedia(image, { caption: prompt })
                gpt.addUserContext(prompt, getUsername(ctx.sender))
            } else {
                await updateMessage(`Рисую ${o.i}`)
            }
        },
        error: async (e) => {
            await updateMessage(makeFailureMessage(toError(e).message))
        },
    })
}

async function doLook(gpt: ChatGpt, msg: MessageContext, prompt: string) {
    const photo = await getMessagePhoto(tg, msg)
    if (photo) {
        const filename = photo.fileId + '.jpg'
        const imgPath = (f: string) => `files/${f}`
        await tg.downloadToFile(imgPath(filename), photo)
        await sharp(imgPath(filename)).resize(256, 256).toFile(imgPath(`256_${filename}`))
        const imageResponse = await gpt.lookAtImage(prompt, `${url}/256_${filename}`)
        return first(imageResponse.choices).message.content ?? makeFailureMessage()
    } else {
        return `Нечего глядеть ${Math.random() > 0.5 ? '🧐' : '🤔'}?`
    }
}