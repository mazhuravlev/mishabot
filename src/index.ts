import { Dispatcher, MessageContext, UpdateFilter, filters } from '@mtcute/dispatcher'
import { Photo, TelegramClient, md } from '@mtcute/node'
import OpenAI from 'openai'
import * as ngrok from 'ngrok'
import Koa from 'koa'
import serve from 'koa-static'
import sharp from 'sharp'
import { LocalStorage } from 'node-localstorage'

import * as env from './env.js'
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs'
import { assertDefined, parseRoleCmd, toError } from './func.js'

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

const localStorage = new LocalStorage('localStorage')

const dp = Dispatcher.for(tg);

const isAllowedMsg: UpdateFilter<MessageContext> = async (msg: MessageContext): Promise<boolean> => {
    const { id, chat, sender, isMention, replyToMessage } = msg
    if (chat.displayName === 'Мишабот' && replyToMessage) {
        return true
    } else if (![
        194153091, // mazhuravlev
        5096987735, // p-zyo
        414083657, // skyreally
        979553187, // влад
    ].includes(sender.id)) {
        return false
    }
    if (isMention || chat.chatType === 'private') {
        return true
    } else if (replyToMessage?.id) {
        const originalMessage = assertDefined((await tg.getMessages(chat.id, [replyToMessage.id]))[0])
        return originalMessage.sender.username === 'mazhuravlev2'
    } else {
        return false
    }
}

let systemRole: string | null = localStorage.getItem('systemRole')
let maxTokens = 200
const addSystemRole = (messages: ChatCompletionMessageParam[])
    : ChatCompletionMessageParam[] =>
    systemRole ? [{ role: 'system', content: systemRole }, ...messages] : messages
let chatLog: ChatCompletionMessageParam[] = []
const resetChatLog = () => chatLog = addSystemRole([])
resetChatLog()

const removeMention = (msg: string) => msg.trim().replace(/^\s*@\w+[\s,]*/, '').trim()

dp.onMessageGroup(
    isAllowedMsg,
    async (upd) => {
        await upd.replyText('Ого, вот это да!')
    })

const regexFilter = (regex: RegExp): UpdateFilter<MessageContext> => async (msg: MessageContext): Promise<boolean> => {
    return regex.test(removeMention(msg.text))
}

dp.onNewMessage(
    filters.and(
        regexFilter(/^(помощь|хелб)/i),
        isAllowedMsg,
    ),
    async (upd) => {
        await upd.answerText(md`**статус** — получить статус лося
**роль [текст роли]** — получить или установить роль, контекст будет сброшен
**глянь [запрос]** — задать вопрос по изображению в сообщении или в отвечаемом сообщении
**помощь** — вывести инструкции по использованию команд`)
    })

dp.onNewMessage(
    filters.and(
        regexFilter(/^статус/i),
        isAllowedMsg,
    ),
    async (upd) => {
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
        upd.answerText(md`**размер лога** = ${chatLog.length} 
**max_tokens** = ${maxTokens} 
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
        const answerRole = () => upd.replyText(systemRole ? `Роль: ${systemRole}` : 'Нету')
        if (!cmd) {
            console.log(`обишба рль [ ${upd.sender.displayName}] ${prompt}`)
            return
        }

        if (cmd.cmd === 'set') {
            systemRole = cmd.role
            localStorage.setItem('systemRole', systemRole)
            resetChatLog()
            await answerRole()
        } else {
            await answerRole()
        }
    })


const imgRegexp = /глянь\s*,?\s*/i
dp.onNewMessage(
    filters.and(
        regexFilter(imgRegexp),
        isAllowedMsg,
        (msg: MessageContext) => removeMention(msg.text).toLowerCase().startsWith('глянь'),
    ),
    async (upd: MessageContext) => {
        const prompt = removeMention(upd.text).replace(imgRegexp, '')
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
            console.log(`working: ${filename}`)
            const waitMessage = await upd.replyText('Щас гляну 🤝')
            const imgPath = (f: string) => `files/${f}`
            await tg.downloadToFile(imgPath(filename), photo)
            await sharp(imgPath(filename)).resize(200, 200).toFile(imgPath(`200_${filename}`))
            const params: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: [{
                    ...chatLog,
                    role: 'user', content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `${url}/200_${filename}` } }
                    ]
                }],
                model: 'vis-openai/gpt-4-turbo',
                n: 1,
                max_tokens: 1000,
            };
            const updateMessage = (text: string) => tg.editMessage({ chatId: waitMessage.chat.id, message: waitMessage.id, text })
            try {
                const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params);
                const answer = chatCompletion.choices[0].message.content
                if (answer) {
                    await updateMessage(answer)
                    chatLog.push({ role: 'user', content: prompt })
                    chatLog.push({ role: 'assistant', content: answer })
                } else {
                    await updateMessage('Не получилось, нет ответа 😢')
                }
            } catch (e) {
                console.log(e)
                await updateMessage(`Не получилось: ${toError(e).message}`)
            }
        } else {
            await upd.replyText(`Шо глянь ${Math.random() > 0.5 ? '🧐' : '🤔'}?`)
        }
    })

dp.onNewMessage(
    isAllowedMsg,
    async (upd) => {
        const prompt = removeMention(upd.text)
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [
                ...chatLog,
                { role: 'user', content: prompt }
            ],
            model: 'openai/gpt-3.5-turbo-0125',
            n: 1,
            max_tokens: maxTokens
        };
        await tg.sendTyping(upd.chat.id, 'typing')
        console.log(`Генерируем ответ: ${prompt}`)
        const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params);
        const answer = chatCompletion.choices[0].message.content
        if (answer) {
            chatLog.push({ role: 'user', content: prompt })
            chatLog.push({ role: 'assistant', content: answer })
            await upd.replyText(answer)
        } else {
            await upd.replyText('Не получилось 😢')
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
