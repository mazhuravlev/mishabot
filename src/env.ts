import { assertDefined } from "./func.js"

const API_ID = parseInt(process.env.API_ID!)
const API_HASH = process.env.API_HASH!
const IMAGE_RECOGNITION = process.env.IMAGE_RECOGNITION?.trim() === '1'
const OPENAI_API_KEY = assertDefined(process.env.OPENAI_API_KEY)
const YANDEX_FOLDER_ID = assertDefined(process.env.YANDEX_FOLDER_ID)

if (isNaN(API_ID) || !API_HASH) {
    throw new Error('API_ID or API_HASH not set!')
}

export { API_HASH, API_ID, IMAGE_RECOGNITION, OPENAI_API_KEY, YANDEX_FOLDER_ID }
