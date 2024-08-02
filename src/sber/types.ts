import t from 'io-ts'

export type Message = t.TypeOf<typeof messageType>
export const messageType = t.type({
    role: t.union([
        t.literal('system'),
        t.literal('user'),
        t.literal('assistant'),
    ]),
    content: t.string,
})

export type AccessToken = t.TypeOf<typeof accessTokenType>
export const accessTokenType = t.type({
    access_token: t.string,
    expires_at: t.number,
})

export type Usage = t.TypeOf<typeof usageType>
export const usageType = t.type({
    completion_tokens: t.number,
    prompt_tokens: t.number,
    total_tokens: t.number,
})

export const completionType = t.type({
    choices: t.array(
        t.type({
            message: messageType,
            index: t.number,
            finish_reason: t.union([
                t.literal('stop'),
                t.literal('length'),
                t.literal('function_call'),
                t.literal('blacklist'),
            ]),
        })
    ),
    created: t.number,
    model: t.string,
    usage: usageType,
    object: t.string,
})

export interface CompletionConfig {
    model: 'GigaChat' | 'GigaChat-Plus' | 'GigaChat - Pro'
    messages: Message[]
    function_call?: 'none' | 'auto'
    stream?: boolean
    max_tokens?: number
    temperature?: number
    top_p?: number
    repetition_penalty?: number
    update_interval?: number
}

export const sttResultType = t.type({
    result: t.array(t.string),
    emotions: t.array(
        t.type({
            negative: t.number,
            neutral: t.number,
            positive: t.number,
        })
    ),
    status: t.number,
})
