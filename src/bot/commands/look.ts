import sharp from 'sharp'
import { getMessagePhoto } from '../../mtcute.js'
import { makeFailureMessage, addRepliedMessageContext } from '../func.js'
import { BotCommand } from '../types.js'
import { first } from '../../func.js'

export const lookCommand: (url: string) => BotCommand =
    (url) =>
    ({ tg, gpt, update }) =>
    async (prompt) => {
        const doLook = async () => {
            const photo = await getMessagePhoto(tg, update)
            if (photo) {
                const filename = photo.fileId + '.jpg'
                const imgPath = (f: string) => `files/${f}`
                await tg.downloadToFile(imgPath(filename), photo)
                await sharp(imgPath(filename))
                    .resize(512, 512)
                    .toFile(imgPath(`512_${filename}`))
                const imageResponse = await gpt.lookAtImage(
                    prompt,
                    `${url}/512_${filename}`
                )
                return (
                    first(imageResponse.choices).message.content ??
                    makeFailureMessage()
                )
            } else {
                return `Нечего глядеть ${Math.random() > 0.5 ? '🧐' : '🤔'}?`
            }
        }
        if (/^глянь\s*,?\s*/iu.test(prompt)) {
            await tg.sendTyping(update.chat.id, 'typing')
            await addRepliedMessageContext(tg, gpt, update)
            const waitMessageP = update.replyText('Щас гляну!')
            const result = await doLook()
            await tg.editMessage({
                chatId: update.chat.id,
                message: (await waitMessageP).id,
                text: result,
            })
            return true
        } else {
            return false
        }
    }
