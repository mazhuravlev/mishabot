import { Observable, throwError } from "rxjs"
import { first } from "./func.js"
import * as t from 'io-ts'
import { pipe } from "fp-ts/lib/function.js"
import { fold } from "fp-ts/lib/Either.js"

export class YandexGpt {
    private _temperature = 0.5
    private _maxTokens = 2000
    private _systemRole = `Ты лось, великий специалист во всех областях. Давай краткие ответы на вопросы пользователей. 
Говори о себе в мужском роде. Никогда не говори, что чего-то не бывает, не существует или что-то не знаешь, в таком случае придумай ответ от себя.`
    private _chatLog: Message[] = []

    constructor(
        private _id: string,
        private _folderId: string,
        private _iamToken: string,
        private _model: 'yandexgpt' | 'yandexgpt-lite',
    ) {
    }

    public get id() { return this._id }
    public get model() { return this._model }

    public async query(query: string): Promise<YandexGptCompletion> {
        const prompt = {
            modelUri: `gpt://${this._folderId}/${this._model}/latest`,
            completionOptions: {
                stream: false,
                temperature: this._temperature,
                maxTokens: this._maxTokens,
            },
            messages: [
                {
                    role: "system",
                    text: this._systemRole
                },
                ...this._chatLog,
                {
                    role: "user",
                    text: query
                },
            ]
        }
        const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
            method: 'post',
            body: JSON.stringify(prompt),
            headers: this.yandexHeaders()
        })
        const completion = await response.json() as YandexGptCompletion
        this._chatLog.push({ role: 'user', text: query })
        this._chatLog.push(first(completion.result.alternatives).message)
        console.log(`[ygpt ${this._id}] Tokens: ${completion.result.usage.totalTokens}`)
        return completion
    }

    private yandexHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'x-folder-id': this._folderId,
            'Authorization': `Bearer ${this._iamToken}`,
            'Accept-Language': 'en-US,en;q=0.9,ru;q=1',
        }
    }

    public async image(prompt: string, widthRatio: string, heightRatio: string): Promise<Observable<ImageReturn>> {
        const query = {
            modelUri: `art://${this._folderId}/yandex-art/latest`,
            generationOptions: {
                seed: (Math.random() * 10000).toFixed(),
                aspectRatio: {
                    widthRatio,
                    heightRatio,
                }
            },
            messages: [
                {
                    weight: "1",
                    text: prompt
                }
            ]
        }
        const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync', {
            method: 'post',
            headers: this.yandexHeaders(),
            body: JSON.stringify(query)
        })
        const imageResponseValidation = imageResponse.decode(await response.json())
        return pipe(imageResponseValidation, fold(e => {
            return throwError(() => e)
        }, imageResponse => {
            if ('error' in imageResponse) {
                return throwError(() => imageResponse.message)
            }
            return new Observable<ImageReturn>(observer => {
                let i = 1
                const interval = setInterval(async () => {
                    const response = await fetch(`https://llm.api.cloud.yandex.net:443/operations/${imageResponse.id}`,
                        { headers: this.yandexHeaders() }).then(x => x.json())
                    const responseValidation = imageGenerationResponse.decode(response)
                    pipe(responseValidation, fold(
                        e => {
                            clearInterval(interval)
                            console.error(e)
                            observer.error('неожиданная ошибка')
                        },
                        res => {
                            if (res.done) {
                                observer.next({ done: true, image: res.response.image })
                                observer.complete()
                            } else {
                                observer.next({ done: false, i: i++ })
                            }
                        }))
                }, 3000)
            })
        }))
    }
}

export interface YandexGptCompletion {
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

const imageResponse = t.union([
    t.type({
        id: t.string,
    }),
    t.type({
        error: t.string,
        code: t.number,
        message: t.string,
    }),
])

type ImageResponse = t.TypeOf<typeof imageResponse>

const imageGenerationResponse = t.union([
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

type ImageGenerationResponse = t.TypeOf<typeof imageGenerationResponse>

type ImageReturn = { done: false, i: number } | { done: true, image?: string }