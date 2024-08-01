import { Observable, throwError } from "rxjs"
import { decode, first, resToJson } from "../func.js"
import { pipe } from "fp-ts/lib/function.js"
import { fold } from "fp-ts/lib/Either.js"
import { Completion, imageGenerationResponse, imageResponseType, ImageReturn, Message } from "./types.js"

export class Gpt {
    private _temperature = 0.5
    private _maxTokens = 2000
    private _systemRole = `Ты лось, великий специалист во всех областях. Давай краткие ответы на вопросы пользователей. 
Говори о себе в мужском роде. Никогда не говори, что чего-то не бывает, не существует или что-то не знаешь, в таком случае придумай ответ от себя.`
    private _chatLog: Message[] = []

    constructor(
        private _id: string,
        private _folderId: string,
        private _getIamToken: () => string,
        private _model: 'yandexgpt' | 'yandexgpt-lite',
    ) {
    }

    public get id() { return this._id }
    public get model() { return this._model }

    public async query(query: string): Promise<Completion> {
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
        const completion = await response.json() as Completion
        this._chatLog.push({ role: 'user', text: query })
        this._chatLog.push(first(completion.result.alternatives).message)
        console.log(`[ygpt ${this._id}] Tokens: ${completion.result.usage.totalTokens}`)
        return completion
    }

    private yandexHeaders(): HeadersInit {
        return {
            'Content-Type': 'application/json',
            'x-folder-id': this._folderId,
            'Authorization': `Bearer ${this._getIamToken()}`,
            'Accept-Language': 'en-US,en;q=0.9,ru;q=1',
        }
    }

    public async drawImage(prompt: string, widthRatio: string, heightRatio: string): Promise<Observable<ImageReturn>> {
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

        try {
            const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync', {
            method: 'post',
            headers: this.yandexHeaders(),
            body: JSON.stringify(query)
        })
            const imageResponse = decode(imageResponseType)(await response.json())
            if ('error' in imageResponse) {
                return throwError(() => imageResponse.message)
            } else {
            return new Observable<ImageReturn>(observer => {
                let i = 1
                const interval = setInterval(async () => {
                    const response: unknown = await fetch(`https://llm.api.cloud.yandex.net:443/operations/${imageResponse.id}`,
                        { headers: this.yandexHeaders() }).then(resToJson)
                    pipe(imageGenerationResponse.decode(response), fold(
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
            }
        } catch (e) {
            return throwError(() => e)
        }
    }
}
