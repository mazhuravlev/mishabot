import { Observable } from "rxjs"
import { first } from "./func.js"

export class YandexGpt {
    private _temperature = 0.5
    private _maxTokens = 2000
    private _systemRole = `Ты лось, великий специалист во всех областях. Давай краткие ответы на вопросы пользователей. 
Говори о себе в мужском роде. Никогда не говори, что чего-то не бывает, не существует или что-то не знаешь, в таком случае придумай ответ от себя.`
    private _chatLog: Message[] = []

    constructor(
        private _id: number,
        private _folderId: string,
        private _iamToken: string,
        private _model: 'yandexgpt' | 'yandexgpt-lite'
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
        }
    }

    public async image(prompt: string, widthRatio: string, heightRatio: string): Promise<Observable<{ done: false, i: number } | { done: true, image?: string }>> {
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
        const json = await response.json() as ImageResponse
        return new Observable(observer => {
            let i = 1
            const interval = setInterval(async () => {
                const res: ImageGenerationResponse = await fetch(`https://llm.api.cloud.yandex.net:443/operations/${json.id}`,
                    { headers: this.yandexHeaders() }).then(x => x.json())
                if (res.done) {
                    clearInterval(interval)
                    observer.next({ done: true, image: res.response.image })
                    observer.complete()
                } else {
                    observer.next({ done: false, i: i++ })
                }
            }, 5000)
        })
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

interface ImageResponse {
    id: string;
    description: string;
    createdAt: null;
    createdBy: string;
    modifiedAt: null;
    done: boolean;
    metadata: null;
}

interface ImageGenerationResponse {
    id: string;
    description: string;
    createdAt: null;
    createdBy: string;
    modifiedAt: null;
    done: boolean;
    metadata: null;
    response: {
        "@type": string;
        image: string;
        modelVersion: string;
    };
}
