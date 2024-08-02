import { md } from '@mtcute/node'
import { cb } from '../../func.js'
import { BotCommand } from '../types.js'

export const statusCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        if (/^статус/i.test(prompt)) {
            await update.replyText(md(cb(JSON.stringify(gpt.usage, null, 2))))
            return true
        } else {
            return false
        }
    }
