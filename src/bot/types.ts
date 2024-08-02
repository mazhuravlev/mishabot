import { MessageContext } from '@mtcute/dispatcher'
import { TelegramClient } from '@mtcute/node'
import Openai from '../openai/index.js'
import Yandex from '../yandex/index.js'
import Sber from '../sber/index.js'

export interface BotContext {
    update: MessageContext
    tg: TelegramClient
    gpt: Openai.Gpt
    yandex: Yandex.Gpt
    sber: Sber.Gpt
}

export type BotCommandExec = (prompt: string) => Promise<boolean>
export type BotCommand = (ctx: BotContext) => BotCommandExec
