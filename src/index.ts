import { Dispatcher, MessageContext } from '@mtcute/dispatcher'
import { InputMedia, TelegramClient } from '@mtcute/node'
import * as ngrok from 'ngrok'
import Koa from 'koa'
import serve from 'koa-static'
import env from './env.js'
import sharp from 'sharp'
import { assertDefined, first, not } from './func.js'
import { getRepliedMessage, makeFailureMessage, removeMention } from './bot.js'
import { getChatId, makeUpdateMessage as _makeUpdateMessage, makeIsAllowedMsg, getMessagePhoto, getMessageText } from './mtcute.js'
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
const getChatGpt = (msg: MessageContext) => {
    const id = getChatId(msg)
    const chatGpt = gptPool.get(id)
    if (chatGpt) {
        return chatGpt
    } else {
        const newChatGpt = new ChatGpt(id, env.OPENAI_API_KEY)
        gptPool.set(id, newChatGpt)
        log.info(`Add new ChatGpt for chat id ${id}`)
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
    async (upd: MessageContext) => {
        const gpt = getChatGpt(upd)
        const prompt = removeMention(await getMessageText(tg, gpt, upd))
        if (prompt === '') return
        if (/^глянь\s*,?\s*/i.test(prompt)) {
            if (not(env.IMAGE_RECOGNITION)) {
                upd.replyText('Нет')
                return
            } else {
                tg.sendTyping(upd.chat.id, 'typing')
                await addRepliedMessageContext()
                const waitMessageP = upd.replyText('Щас гляну!')
                const result = await doLook(gpt, upd, prompt)
                await makeUpdateMessage(await waitMessageP)(result)
            }
        } else if (/^нарисуй/i.test(prompt)) {
            if (/нарисуй это/i.test(prompt)) {
                const repliedMessage = await getRepliedMessage(tg, upd, true)
                if (repliedMessage && repliedMessage.text) {
                    await doDraw(upd, repliedMessage.text)
                } else {
                    upd.answerText('Что именно требуется нарисовать?')
                }
            } else {
                await doDraw(upd, prompt)
            }
        } else {
            await addRepliedMessageContext()
            const { content } = first((await gpt.query(prompt, upd.sender.displayName)).choices).message
            if (content) {
                if (/^скажи/i.test(prompt)) {
                    const voice = InputMedia.voice(new Uint8Array(await gpt.speak(content)))
                    await upd.replyMedia(voice)
                } else {
                    upd.answerText(content)
                }
            } else {
                await upd.replyText(makeFailureMessage())
            }
        }

        async function addRepliedMessageContext() {
            const repliedMessage = await getRepliedMessage(tg, upd)
            if (repliedMessage) {
                gpt.addUserContext(repliedMessage.text, repliedMessage.sender.displayName)
            }
        }
    })

tg.run({
    phone: () => tg.input('Phone > '),
    code: () => tg.input('Code > '),
    password: () => tg.input('Password > '),
}, async (self) => {
    console.log(`Logged in as ${self.displayName}
Username: ${await tg.getMyUsername()}`)
})

async function doDraw(upd: MessageContext, prompt: string) {
    const aspectRegex = /\s(\d+)\/(\d+)/
    const aspectMatch = aspectRegex.exec(upd.text)
    const waitMessage = await upd.replyText('Щас нарисую!')
    const updateMessage = makeUpdateMessage(waitMessage)
    const yGpt = getYandexGpt(upd)
    const img = await yGpt.image(
        prompt.replace(aspectRegex, ''),
        aspectMatch?.[1] ?? '1',
        aspectMatch?.[2] ?? '1'
    )
    img.subscribe({
        next: async (o) => {
            if (o.done) {
                await tg.deleteMessages([waitMessage])
                const image = InputMedia.photo(
                    Buffer.from(assertDefined(o.image), 'base64'),
                    { fileMime: 'image/jpeg' })
                await upd.replyMedia(image)
            } else {
                updateMessage(`Рисую ${o.i}`)
            }
        },
        error: async (e) => {
            if (typeof e === 'string') {
                updateMessage(makeFailureMessage(e))
            } else {
                updateMessage(makeFailureMessage('совсем неожиданная ошибка'))
            }
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
        const imageResponse = await gpt.lookAtImage(prompt, `${url}/256_${filename}`, msg.sender.displayName)
        return first(imageResponse.choices).message.content ?? makeFailureMessage()
    } else {
        return `Нечего глядеть ${Math.random() > 0.5 ? '🧐' : '🤔'}?`
    }
}