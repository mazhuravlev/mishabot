import t from 'io-ts'

export const roleType = t.union([
    t.literal('system'),
    t.literal('assistant'),
    t.literal('user'),
])

export type Usage = t.TypeOf<typeof usageType>
export const usageType = t.type({
    completion_tokens: t.number,
    prompt_tokens: t.number,
    total_tokens: t.number,
})

export type StorageType = t.TypeOf<typeof storageType>
export const storageType = t.type({
    systemRole: t.string,
    chatLog: t.array(
        t.union([
            t.type({
                role: roleType,
                content: t.string,
            }),
            t.type({
                role: roleType,
                content: t.string,
                name: t.string,
            }),
        ])
    ),
    usage: usageType,
})

export interface ChatLogRecord {
    role: 'user' | 'assistant' | 'system'
    content: string
    name?: string
}
