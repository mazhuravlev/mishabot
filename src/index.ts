import { Dispatcher, MessageContext, UpdateFilter, filters } from '@mtcute/dispatcher'
import { InputMedia, InputMediaLike, Message, Photo, TelegramClient, md } from '@mtcute/node'
import * as ngrok from 'ngrok'
import Koa from 'koa'
import serve from 'koa-static'
import { LocalStorage } from 'node-localstorage'
import * as env from './env.js'
import sharp from 'sharp'
import { assertDefined, first, getChatTopicId, makeFailureMessage, parseRoleCmd, regexFilter, removeMention } from './func.js'
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
const dp = Dispatcher.for(tg)
export const makeUpdateMessage = (msg: Message) => (text?: string, media?: InputMediaLike) => tg.editMessage({ chatId: msg.chat.id, message: msg.id, text })

const yandexAuth = new Yandex.Auth(log)

const yandexGptPool = new Map<string, Yandex.Gpt>()
const getYandexGpt = (msg: MessageContext) => {
    const id = getChatTopicId(msg)
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
const getChatGpt = async (msg: MessageContext) => {
    const id = getChatTopicId(msg)
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

const localStorage = new LocalStorage('localStorage')

const isAllowedMsg: UpdateFilter<MessageContext> = async (msg: MessageContext): Promise<boolean> => {
    const { chat, isMention, replyToMessage } = msg
    if (msg.sender.username?.includes('_bot')) return false
    if (isMention || chat.chatType === 'private') {
        return true
    } else if (replyToMessage?.id) {
        const originalMessage = assertDefined((await tg.getMessages(chat.id, [replyToMessage.id]))[0])
        return originalMessage.sender.username === await tg.getMyUsername()
    } else {
        return false
    }
}

dp.onMessageGroup(
    isAllowedMsg,
    async (upd) => {
        await upd.replyText('Ого, вот это да!')
    })

dp.onNewMessage(
    filters.and(
        regexFilter(/^(помощь)/i),
        isAllowedMsg,
    ),
    async (upd) => {
        await upd.replyText(md`**статус** — получить статус лося
**выжимка[!]** — выжимка, с ! замена лога на выжимку
**роль: [текст роли]** — установить системную роль
**роль?** — узнать текущую системную роль
**глянь [запрос]** — задать вопрос по изображению в сообщении или в отвечаемом сообщении
**помощь** — вывести инструкции по использованию команд`)
    })

dp.onNewMessage(
    filters.and(
        regexFilter(/^статус/i),
        isAllowedMsg,
    ),
    async (upd) => {
        const gpt = await getChatGpt(upd)
        let credits = '-'
        try {
            const res = await fetch(
                'https://api.vsegpt.ru/v1/balance',
                {
                    headers: {
                        'Authorization': `Bearer ${process.env['OPENAI_API_KEY']}`,
                        'Content-Type': 'application/json',
                    }
                }
            )
            const json = await res.json()
            credits = json.data.credits
        } catch (e) {
            console.error(e)
        }
        upd.replyText(md`Для чата **${getChatTopicId(upd)}** (${upd.chat.displayName})
**размер лога** = ${gpt.logSize} 
**total_tokens** = ${gpt.usage?.total_tokens} 
**credits** = ${credits}`)
    }
)

dp.onNewMessage(
    filters.and(
        isAllowedMsg,
        (msg: MessageContext) => !!parseRoleCmd(removeMention(msg.text)),
    ),
    async (upd) => {
        const prompt = removeMention(upd.text)
        const cmd = parseRoleCmd(prompt)
        const gpt = await getChatGpt(upd)
        const systemRole = gpt.role
        const answerRole = () => upd.replyText(systemRole ? `Роль: ${systemRole}` : 'Нету')
        if (!cmd) {
            console.error(`role [ ${upd.sender.displayName}] ${prompt}`)
            return
        }
        if (cmd.cmd === 'set') {
            gpt.role = cmd.role
            await answerRole()
        } else {
            await answerRole()
        }
    })

dp.onNewMessage(
    filters.and(isAllowedMsg, filters.voice),
    async (upd: MessageContext) => {
        if (upd.media?.type !== 'voice') {
            await upd.replyText('Што?')
            return
        }
        const buffer = await tg.downloadAsBuffer(upd.media)
        const gpt = await getChatGpt(upd)
        const text = await gpt.transcribe(buffer)
        tg.sendTyping(upd.chat.id, 'typing')
        const completion = await gpt.query(text)
        await upd.replyText(first(completion.choices).message.content ?? makeFailureMessage())
    })

const imgRegexp = /глянь\s*,?\s*/i
dp.onNewMessage(
    filters.and(
        regexFilter(imgRegexp),
        isAllowedMsg,
        (msg: MessageContext) => removeMention(msg.text).toLowerCase().startsWith('глянь'),
    ),
    async (upd: MessageContext) => {
        if (!env.IMAGE_RECOGNITION) {
            upd.replyText('Нет')
            return
        }
        const speakRegex = /^скажи/i
        const prompt = removeMention(upd.text).replace(imgRegexp, '').replace(speakRegex, '')
        const photo = await (async (msg: MessageContext) => {
            if (upd.replyToMessage?.id) {
                const repliedMsg = assertDefined((await tg.getMessages(upd.chat.id, [upd.replyToMessage.id]))[0])
                return repliedMsg.media?.type === 'photo' ? repliedMsg.media as Photo : undefined
            } else {
                return upd.media?.type === 'photo' ? msg.media as Photo : undefined
            }
        })(upd)
        if (photo) {
            const filename = photo.fileId + '.jpg'
            log.info(`working: ${filename}`)
            const waitMessage = await upd.replyText('Щас гляну 🤝')
            const imgPath = (f: string) => `files/${f}`
            await tg.downloadToFile(imgPath(filename), photo)
            await sharp(imgPath(filename)).resize(200, 200).toFile(imgPath(`200_${filename}`))
            const updateMessage = makeUpdateMessage(waitMessage)
            const gpt = await getChatGpt(upd)
            const imageResponse = await gpt.lookAtImage(prompt, `${url}/200_${filename}`)
            const resultText = first(imageResponse.choices).message.content ?? makeFailureMessage()
            if (speakRegex.test(removeMention(upd.text).replace(imgRegexp, ''))) {
                const audio = await gpt.speak(resultText)
                await tg.deleteMessages([waitMessage])
                await upd.replyMedia(InputMedia.voice(new Uint8Array(audio)))
            } else {
                await updateMessage(resultText)
            }
        } else {
            await upd.replyText(`Шо глянь ${Math.random() > 0.5 ? '🧐' : '🤔'}?`)
        }
    })

dp.onNewMessage(
    filters.and(
        regexFilter(/^выжимка/i),
        isAllowedMsg,
    ),
    async (upd) => {
        const gpt = await getChatGpt(upd)
        const waitMessage = await upd.replyText('Щас сделаю выжимку из нашей беседы 🤝')
        await tg.sendTyping(upd.chat.id, 'typing')
        const updateMessage = makeUpdateMessage(waitMessage)
        const answer = await gpt.exerpt(/^выжимка!/i.test(upd.text))
        await updateMessage(first(answer.choices).message.content ?? makeFailureMessage())
    }
)

const drawRegex = /^нарисуй/i
dp.onNewMessage(
    filters.and(
        regexFilter(drawRegex),
        isAllowedMsg,
    ),
    async (upd) => {
        const aspectRegex = /\s(\d+)\/(\d+)/
        const aspectMatch = aspectRegex.exec(upd.text)
        const prompt = removeMention(upd.text).replace(drawRegex, '').replace(aspectRegex, '')
        const waitMessage = await upd.replyText('Щас нарисую 🤝')
        const updateMessage = makeUpdateMessage(waitMessage)
        await tg.sendTyping(upd.chat.id, 'typing')
        const yGpt = getYandexGpt(upd)
        const img = await yGpt.image(
            prompt,
            aspectMatch?.[1] ?? '1',
            aspectMatch?.[2] ?? '1'
        )
        img.subscribe({
            next: async (o) => {
                if (o.done) {
                    await tg.deleteMessages([waitMessage])
                    await upd.replyMedia(InputMedia.photo(Buffer.from(assertDefined(o.image), 'base64'), { fileMime: 'image/jpeg' }))
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
)

dp.onNewMessage(
    isAllowedMsg,
    async (upd) => {
        const speakRegex = /^скажи/i
        const prompt = removeMention(upd.text).replace(speakRegex, '')
        await tg.sendTyping(upd.chat.id, 'typing')
        const gpt = await getChatGpt(upd)
        if (upd.replyToMessage?.id) {
            const originalMessage = assertDefined((await tg.getMessages(upd.chat.id, [upd.replyToMessage.id]))[0])
            if (originalMessage.sender.username !== await tg.getMyUsername()) {
                gpt.pushContext({ role: 'user', content: originalMessage.text })
            }
        }
        const answer = await gpt.query(prompt)
        const message = answer.choices[0].message
        if (answer && message.content) {
            if (speakRegex.test(removeMention(upd.text))) {
                const audio = await gpt.speak(message.content)
                await upd.replyMedia(InputMedia.voice(new Uint8Array(audio)))
            } else {
                await upd.replyText(message.content)
            }
            if (gpt.usage) {
                log.debug(`[usage gpt ${gpt.id}]: ${gpt.usage.total_tokens}`)
            }
        } else {
            await upd.replyText(makeFailureMessage())
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

