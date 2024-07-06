import { Dispatcher, MessageContext, filters } from '@mtcute/dispatcher'
import { TelegramClient } from '@mtcute/node'
import OpenAI from 'openai'
import * as ngrok from 'ngrok'
import Koa from "koa"
import serve from "koa-static"
import sharp from 'sharp'
import { LocalStorage } from 'node-localstorage'

import * as env from './env.js'
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs'

const app = new Koa()
app.use(serve('files', {}))
app.listen(8080)
const url = await ngrok.connect({ proto: 'http', addr: 8080 });
console.log(url)

const tg = new TelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: 'bot-data/session',
    updates: {
        catchUp: false,
        messageGroupingInterval: 250,
    },
})

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'],
    baseURL: 'https://api.vsegpt.ru/v1',
})

const assertDefined = <T>(x: T | undefined | null): T => {
    if (x) return x
    throw 'assertDefined'
}

const localStorage = new LocalStorage('localStorage')

const dp = Dispatcher.for(tg);

dp.onMessageGroup(async (upd) => {
    await upd.replyText('Ого, вот это да!')
})

const isAllowedMsg = async ({ id, chat, sender, isMention, replyToMessage }: MessageContext) => {
    if (chat.displayName === 'Мишабот' && replyToMessage) {
        // noop
    } else if (![
        194153091, // mazhuravlev
        5096987735, // p-zyo
        414083657, // skyreally
        979553187, // влад
    ].includes(sender.id)) {
        return false
    }
    // if (isMention || chat.chatType === 'private') {
    //     return true
    // } 
    else if (replyToMessage?.id) {
        const originalMessage = assertDefined((await tg.getMessages(chat.id, [replyToMessage.id]))[0])
        return originalMessage.sender.username === 'mazhuravlev2'
    } else {
        return false
    }
}

let systemRole: string | null = localStorage.getItem('systemRole')
const addSystemRole = (messages: ChatCompletionMessageParam[])
    : ChatCompletionMessageParam[] =>
    systemRole ? [{ role: 'system', content: systemRole }, ...messages] : messages

dp.onNewMessage(async (msg) => {
    const prompt = msg.text.replace(/^\s*@\S+[\s,]*/, '').toLowerCase()
    console.log(`[${msg.chat.displayName}, ${msg.sender.username || 'none'}(${msg.sender.id})]: ${prompt}`)
    if (!(await isAllowedMsg(msg))) return
    const addReplyContext = async (messages: ChatCompletionMessageParam[]): Promise<ChatCompletionMessageParam[]> => {
        const a = msg.replyToMessage
        if (a && a.id) {
            const b = await tg.getMessages(msg.chat.id, [a.id])
            const params: ChatCompletionMessageParam[] = b.flatMap(x => x ? { role: 'user', content: x.text } : [])
            return [...params, ...messages]
        }
        return messages
    }
    if (prompt.includes('роль?')) {
        await msg.replyText(systemRole ? `Роль: ${systemRole}` : 'Нету')
    } else if (prompt.includes('роль:')) {
        systemRole = prompt.replace(/^\S* *роль *: */, '')
        localStorage.setItem('systemRole', systemRole)
        await msg.replyText(systemRole ? `Роль: ${systemRole}` : 'Нету')
    } else if (prompt.includes('глянь')) {
        if (msg.media?.type === 'photo') {
            const filename = msg.media.fileId + '.jpg'
            console.log(`working: ${filename}`)
            const waitMessage = await msg.replyText('Щас гляну 🤝')
            const imgPath = (f: string) => `files/${f}`
            await tg.downloadToFile(imgPath(filename), msg.media)
            await sharp(imgPath(filename)).resize(200, 200).toFile(imgPath(`200_${filename}`))
            const params: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: [{
                    role: 'user', content: [
                        { type: 'text', text: prompt.replace(/.*глянь /, '') },
                        { type: 'image_url', image_url: { url: `${url}/200_${filename}` } }
                    ]
                }],
                model: 'vis-openai/gpt-4-turbo',
                n: 1,
            };
            try {
                const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params);
                await tg.editMessage({ chatId: waitMessage.chat.id, message: waitMessage.id, text: chatCompletion.choices[0].message.content || 'Не получилось 😢' })
            } catch (e) {
                console.log(e)
                await tg.editMessage({ chatId: waitMessage.chat.id, message: waitMessage.id, text: 'Не получилось 😢' })
            }
        } else {
            await msg.replyText('Шо глянь?')
        }
    } else {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: addSystemRole((await addReplyContext([
                { role: 'user', content: prompt }
            ]))),
            model: 'openai/gpt-3.5-turbo-0125',
            n: 1,
        };
        await tg.sendTyping(msg.chat.id, 'typing')
        console.log(`Генерируем ответ: ${prompt}`)
        const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params);
        await msg.replyText(chatCompletion.choices[0].message.content || 'Не получилось 😢')
    }
})

tg.run({
    phone: () => tg.input('Phone > '),
    code: () => tg.input('Code > '),
    password: () => tg.input('Password > ')
}, async (self) => {
    console.log(`Logged in as ${self.displayName}`)
    console.log(`Роль: ${systemRole}`)
})
