import { cleanEnv, str, bool, num } from 'envalid'

const env = cleanEnv(process.env, {
    API_ID: num(),
    API_HASH: str(),
    IMAGE_RECOGNITION: bool(),
    OPENAI_API_KEY: str(),
    YANDEX_FOLDER_ID: str(),
})

export default env
