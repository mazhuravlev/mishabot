import { cleanEnv, str, bool, num } from 'envalid'

const env = cleanEnv(process.env, {
    API_ID: num(),
    API_HASH: str(),
    IMAGE_RECOGNITION: bool(),
    OPENAI_API_KEY: str(),
    OPENAI_BASE_URL: str(),
    YANDEX_FOLDER_ID: str(),
    GPT_DEFAULT_SYSTEM_ROLE: str(),
    SBER_SCOPE: str(),
    SBER_AUTH: str(),
    SBER_SALUTE_SCOPE: str(),
    SBER_SALUTE_AUTH: str(),
})

export default env
