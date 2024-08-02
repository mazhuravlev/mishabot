import { md } from '@mtcute/node'
import { cb } from '../../func.js'
import { BotCommand } from '../types.js'

export const moderationCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        const regex = /модерация\s+/
        if (regex.test(prompt)) {
            await update.replyText(
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
