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
import { assertDefined, parseRoleCmd, regexFilter, removeMention, toError } from './func.js'

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

const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: 'https://api.vsegpt.ru/v1',
})

const localStorage = new LocalStorage('localStorage')

const dp = Dispatcher.for(tg);

const isAllowedMsg: UpdateFilter<MessageContext> = async (msg: MessageContext): Promise<boolean> => {
    const { chat, isMention, replyToMessage } = msg

    if (chat.displayName === 'Мишабот' && replyToMessage) {
        return true
    } else if (isMention || chat.chatType === 'private') {
        return true
    } else if (replyToMessage?.id) {
        const originalMessage = assertDefined((await tg.getMessages(chat.id, [replyToMessage.id]))[0])
        return originalMessage.sender.username === await tg.getMyUsername()
    } else {
        return false
    }
}

const maxTokens = 1000
let usageTotalTokens = 0

let chatLog = ((): ChatCompletionMessageParam[] => {
    const savedSystemRole: string | null = localStorage.getItem('systemRole')
    const addSystemRole = (messages: ChatCompletionMessageParam[])
        : ChatCompletionMessageParam[] =>
        savedSystemRole ? [{ role: 'system', content: savedSystemRole }, ...messages] : messages
    const savedChatLog = localStorage.getItem('chatLog')
    return savedChatLog ? JSON.parse(savedChatLog) : addSystemRole([])
})()

const resetChatLog = () => chatLog = chatLog.filter(x => x.role === 'system')

const setSystemRole = (role: string) => {
    localStorage.setItem('systemRole', role)
    chatLog = [
        { role: 'system', content: role },
        ...chatLog.filter(x => x.role !== 'system')
    ]
    saveChatLog()
}

const getSystemRole = () => {
    const x = chatLog.find(x => x.role === 'system')
    return x ? x.content : undefined
}

const pushChatLog = (msg: ChatCompletionMessageParam[]) => {
    msg.forEach(x => chatLog.push(x))
    saveChatLog()
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
        await upd.answerText(md`**статус** — получить статус лося
**сброс** — сбросить лог
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
**total_tokens** = ${usageTotalTokens} 
**max_tokens** = ${maxTokens} 
**credits** = ${credits}`)
    }
)

dp.onNewMessage(
    filters.and(
        regexFilter(/^сброс/i),
        isAllowedMsg,
    ),
    async (upd) => {
        resetChatLog()
        await upd.answerText('Лог чата сброшен')
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
        const systemRole = getSystemRole()
        const answerRole = () => upd.replyText(systemRole ? `Роль: ${systemRole}` : 'Нету')
        if (!cmd) {
            console.error(`role [ ${upd.sender.displayName}] ${prompt}`)
            return
        }

        if (cmd.cmd === 'set') {
            setSystemRole(cmd.role)
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
        if (!env.IMAGE_RECOGNITION) {
            upd.replyText('Нет')
            return
        }
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
    filters.and(
        regexFilter(/^выжимка/i),
        isAllowedMsg,
    ),
    async (upd) => {
        const waitMessage = await upd.replyText('Щас сделаю выжимку из нашей беседы 🤝')
        await tg.sendTyping(upd.chat.id, 'typing')
        const updateMessage = (text: string) => tg.editMessage({ chatId: waitMessage.chat.id, message: waitMessage.id, text })
        const answer = await queryGpt('Сделай выжимку из нашей беседы')
        const { content } = answer.choices[0].message
        if (answer && content) {
            await updateMessage(content)
            if (/^выжимка!/i.test(upd.text)) {
                resetChatLog()
                pushChatLog([{ role: 'assistant', content }])
            }
        } else {
            await updateMessage('Не получилось 😢')
        }
    }
)

dp.onNewMessage(
    isAllowedMsg,
    async (upd) => {
        const prompt = removeMention(upd.text)
        await tg.sendTyping(upd.chat.id, 'typing')
        const answer = await queryGpt(prompt)
        const message = answer.choices[0].message
        if (answer && message.content) {
            pushChatLog([
                { role: 'user', content: prompt },
                { role: 'assistant', content: message.content }
            ])
            await upd.replyText(message.content)
            if (answer.usage?.total_tokens) {
                usageTotalTokens = answer.usage.total_tokens
                console.log(`[usage]: ${answer.usage.total_tokens}`)
            }
        } else {
            await upd.replyText('Не получилось 😢')
        }
    })

tg.run({
    phone: () => tg.input('Phone > '),
    code: () => tg.input('Code > '),
    password: () => tg.input('Password > ')
}, async (self) => {
    console.log(`Logged in as ${self.displayName}
Роль: ${getSystemRole()}
Username: ${await tg.getMyUsername()}
Размер лога: ${chatLog.length}`)

})

function saveChatLog() {
    localStorage.setItem('chatLog', JSON.stringify(chatLog))
}

async function queryGpt(prompt: string) {
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
        messages: [
            ...chatLog,
            { role: 'user', content: prompt }
        ],
        model: 'openai/gpt-4o-mini',
        n: 1,
        max_tokens: maxTokens
    }
    const chatCompletion: OpenAI.Chat.ChatCompletion = await openai.chat.completions.create(params)
    return chatCompletion
}

