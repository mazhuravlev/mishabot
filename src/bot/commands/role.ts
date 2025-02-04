import { BotCommand } from '../types.js'

export const roleCommand: BotCommand =
    ({ gpt, update }) =>
    async (prompt) => {
        const setRoleRegex = /^установи роль[^А-яA-z]*/iu
        if (setRoleRegex.test(prompt)) {
            const role = prompt.replace(setRoleRegex, '')
            if (role) {
                gpt.role = role
                await update.replyText(role)
            } else {
                await update.replyText('Какую роль установить?')
            }
            return true
        } else if (/^[А-я\w]+ роль/iu.test(prompt)) {
            await update.replyText(gpt.role)
            return true
        } else {
            return false
        }
    }
