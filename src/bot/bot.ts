import { BotCommand } from './types.js'

export { defaultCommand } from './commands/default.js'
export { drawCommand } from './commands/draw.js'
export { lookCommand } from './commands/look.js'
export { moderationCommand } from './commands/moderation.js'
export { roleCommand } from './commands/role.js'
export { statusCommand } from './commands/status.js'
export const noopCommand: BotCommand = () => () => Promise.resolve(false)

export { BotCommand } from './types.js'

export { removeMention } from './func.js'
