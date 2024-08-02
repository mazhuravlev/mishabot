import { Dispatcher, MessageContext } from '@mtcute/dispatcher'
import { TelegramClient } from '@mtcute/node'
import * as ngrok from 'ngrok'
import Koa from 'koa'
import serve from 'koa-static'
import env from './env.js'
import { decode } from './func.js'
import Bot from './bot/index.js'
import { getChatId, makeIsAllowedMsg, getMessageText } from './mtcute.js'
import { Logger } from 'tslog'
import { AppLogger } from './types.js'
import Openai from './openai/index.js'
import Yandex from './yandex/index.js'
import Sber from './sber/index.js'
import { readFile } from 'node:fs/promises'
import { yandexKeyType } from './yandex/types.js'
import winCa from 'win-ca'

winCa.inject('+')

const log: AppLogger = new Logger()

const app = new Koa()
app.use(serve('files', {}))
app.listen(8080)
const staticUrl = await ngrok.connect({ proto: 'http', addr: 8080 })

const tg = new TelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: 'bot-data/session',
    updates: {
        catchUp: false,
        messageGroupingInterval: 250,
    },
})

const yandexKeyJson: unknown = JSON.parse(
    await readFile(new URL('../key.json', import.meta.url), 'utf8')
)
const yandexKey = decode(yandexKeyType)(yandexKeyJson)
const yandexAuth = new Yandex.Auth(yandexKey, log)
const yandexGptPool = new Map<string, Yandex.Gpt>()
const getYandexGpt = (chatId: string) => {
    const yandexGpt = yandexGptPool.get(chatId)
    if (yandexGpt) {
        return yandexGpt
    } else {
        const newYandexGpt = new Yandex.Gpt(
            chatId,
            env.YANDEX_FOLDER_ID,
            () => yandexAuth.iamToken,
            'yandexgpt'
        )
        yandexGptPool.set(chatId, newYandexGpt)
        log.info(
            `Add new YandexGPT '${newYandexGpt.model}' for chat id ${chatId}`
        )
        return newYandexGpt
    }
}

const gptPool = new Map<string, Openai.Gpt>()
const getChatGpt = (chatId: string) => {
    const chatGpt = gptPool.get(chatId)
    if (chatGpt) {
        return chatGpt
    } else {
        const newChatGpt = new Openai.Gpt(
            chatId,
            log,
            env.OPENAI_API_KEY,
            env.OPENAI_BASE_URL,
            env.GPT_DEFAULT_SYSTEM_ROLE
        )
        gptPool.set(chatId, newChatGpt)
        log.info(`Add new ChatGpt for chat id ${chatId}`)
        return newChatGpt
    }
}

const sberApi = new Sber.Api(env.SBER_AUTH, env.SBER_SALUTE_AUTH, log)
const sberGptPool = new Map<string, Sber.Gpt>()
const getSberGpt = (chatId: string) => {
    const sber = sberGptPool.get(chatId)
    if (sber) {
        return sber
    } else {
        const newSber = new Sber.Gpt(
            chatId,
            sberApi,
            log,
            env.GPT_DEFAULT_SYSTEM_ROLE
        )
        sberGptPool.set(chatId, newSber)
        log.info(`Add new SberGpt for chat id ${chatId}`)
        return newSber
    }
}

const dp = Dispatcher.for(tg)
const isAllowedMsg = makeIsAllowedMsg(tg)

dp.onMessageGroup(isAllowedMsg, async (upd) => {
    await upd.replyText('Ого, вот это да!')
})

dp.onNewMessage(isAllowedMsg, async (update: MessageContext) => {
    const useSber = true
    const chatId = getChatId(update)
    const gpt = getChatGpt(chatId)
    const yandex = getYandexGpt(chatId)
    const sber = getSberGpt(chatId)
    const messageText = await getMessageText(
        tg,
        update,
        useSber ? (v) => sber.api.transcribe(v) : (v) => gpt.transcribe(v)
    )
    const prompt = Bot.removeMention(messageText)
    if (prompt === '') return
    log.debug(
        'UPD',
        chatId,
        update.sender.username,
        update.media?.type ?? 'none',
        update.text
    )

    const botContext = { gpt, yandex, update, tg, sber }
    const commands: Bot.BotCommand[] = [
        Bot.statusCommand,
        Bot.roleCommand,
        Bot.moderationCommand,
        env.IMAGE_RECOGNITION ? Bot.lookCommand(staticUrl) : Bot.noopCommand,
        useSber ? Bot.sberDrawCommand : Bot.yandexDrawCommand,
        useSber ? Bot.sberDefaultCommand : Bot.defaultCommand,
    ]

    for (const command of commands) {
        const result = await command(botContext)(prompt)
        if (result) break
    }
})

tg.run(
    {
        phone: () => tg.input('Phone > '),
        code: () => tg.input('Code > '),
        password: () => tg.input('Password > '),
    },
    (self) => {
        console.log(`Logged in as ${self.username}`)
    }
)
