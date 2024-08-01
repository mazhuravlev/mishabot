import * as t from 'io-ts'

export type IamToken = t.TypeOf<typeof iamToken>
export const iamToken = t.type({
    iamToken: t.string,
    expiresAt: t.string,
})

export interface Completion {
    result: Result;
}

export interface Result {
    alternatives: Alternative[];
    usage: Usage;
    modelVersion: string;
}

export interface Alternative {
    message: Message;
    status: string;
}

export interface Message {
    role: 'user' | 'system' | 'assistant';
    text: string;
}

export interface Usage {
    inputTextTokens: string;
    completionTokens: string;
    totalTokens: string;
}

export interface YandexGptPrompt {
    modelUri: string;
    completionOptions: CompletionOptions;
    messages: Message[];
}

export interface CompletionOptions {
    stream: boolean;
    temperature: number;
    maxTokens: string;
}

export const imageResponseType = t.union([
    t.type({
        id: t.string,
    }),
    t.type({
        error: t.string,
        code: t.number,
        message: t.string,
    }),
])

export type ImageResponse = t.TypeOf<typeof imageResponseType>

export const imageGenerationResponse = t.union([
    t.type({
        done: t.literal(false),
    }),
    t.type({
        done: t.literal(true),
        response: t.type({
            image: t.string,
        }),
    }),
])

export type ImageGenerationResponse = t.TypeOf<typeof imageGenerationResponse>

export type ImageReturn = { done: false, i: number } | { done: true, image?: string }
