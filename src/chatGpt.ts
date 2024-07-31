import OpenAI, { toFile } from "openai"
import { first } from "./func.js"
import { LocalStorage } from 'node-localstorage'
import t from 'io-ts'
import { pipe } from "fp-ts/lib/function.js"
import { fold } from "fp-ts/lib/Either.js"
import { Subject } from "rxjs"
import { AppLogger } from "./types.js"

const maxTokens = 1000
const usageCheckIntervalMinutes = 1
const excerptTokenThreshold = 2000

export class ChatGpt {
    private _temperature = 1
    private _chatLog: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    private _systemRole: string
    private _openai: OpenAI
    private _usage: OpenAI.Completions.CompletionUsage | undefined
    private _storage: LocalStorage
    private _excerptSubject = new Subject<OpenAI.Completions.CompletionUsage>()
    private _excerptIntervalId: NodeJS.Timeout

    constructor(
        private _id: string,
        private _log: AppLogger,
        openAiKey: string,
        openAiBaseUrl: string,
        defaultSystemRole: string,
    ) {
        this._systemRole = defaultSystemRole
        this._openai = new OpenAI({
            apiKey: openAiKey,
            baseURL: openAiBaseUrl,
        })
        this._storage = new LocalStorage(`localStorage/gpt_${this._id}`)
        this.loadState()
        this._excerptIntervalId = setInterval(async () => {
            if (!this._usage) return
            if (this._usage.prompt_tokens > excerptTokenThreshold) {
                _log.info('make excerpt', this._id)
                this._excerptSubject.next(this._usage)
                await this.exerpt(true)
            }
        }, usageCheckIntervalMinutes * 60 * 1000)
    }

    public get id() { return this._id }

    public get usage() { return this._usage }

    public get logSize() { return this._chatLog.length }

    public get role(): string { return this._systemRole }

    public get excerptObservable() { return this._excerptSubject.asObservable() }

    public set role(role: string) {
        this._systemRole = role
        this.saveState()
    }

    public async query(prompt: string, username: string | undefined) {
        const completion = await this._query(prompt)
        this._chatLog.push({ role: 'user', content: prompt, name: username })
        this._chatLog.push(first(completion.choices).message)
        this.saveState()
        return completion
    }

    public async exerpt(apply: boolean) {
        const completion = await this._query('Сделай подробную выжимку из нашей беседы')
        const answer = first(completion.choices)
        if (apply) {
            this._chatLog = [answer.message]
        }
        this.updateUsage(completion)
        this.saveState()
        return completion
    }

    public async lookAtImage(prompt: string, imageUrl: string) {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [
                { role: 'system', content: this._systemRole },
                ...this._chatLog,
                {
                    role: 'user', content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ],
            model: 'openai/gpt-4o-mini',
            n: 1,
            max_tokens: maxTokens,
            temperature: this._temperature,
        }
        const completion = await this._openai.chat.completions.create(params)
        this._chatLog.push(first(completion.choices).message)
        this.updateUsage(completion)
        this.saveState()
        return completion
    }

    public async speak(text: string) {
        const x = await this._openai.audio.speech.create({
            input: text,
            voice: 'onyx',
            model: 'tts-openai/tts-1',
        })
        const r = await x.arrayBuffer()
        return r
    }

    public async transcribe(buffer: Uint8Array) {
        const file = await toFile(buffer, 'voice.ogg')
        const { text } = await this._openai.audio.transcriptions.create({
            file,
            model: 'stt-openai/whisper-1',
            language: 'ru',
            response_format: 'json',
            temperature: 0.5,
        })
        return text
    }

    public dispose() {
        clearInterval(this._excerptIntervalId)
    }

    private async _query(prompt: string) {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [
                { role: 'system', content: this._systemRole },
                ...this._chatLog,
                { role: 'user', content: prompt }
            ],
            model: 'openai/gpt-4o-mini',
            n: 1,
            max_tokens: maxTokens,
            temperature: this._temperature
        }
        const completion: OpenAI.Chat.ChatCompletion = await this._openai.chat.completions.create(params)
        this.updateUsage(completion)
        return completion
    }

    private updateUsage(completion: OpenAI.Chat.Completions.ChatCompletion) {
        if (completion.usage) {
            this._usage = completion.usage;
        }
    }

    public addUserContext(content: string, name: string | undefined) {
        this._chatLog.push({
            role: 'user',
            content,
            name,
        })
    }

    private loadState() {
        const json = this._storage.getItem('state.json')
        if (json) {
            pipe(
                storageType.decode(JSON.parse(json)),
                fold(
                    e => { throw e },
                    state => {
                        this._systemRole = state.systemRole
                        this._chatLog = state.chatLog
                        this._usage = state.usage
                    }
                ))
        }
    }

    private saveState() {
        const state: StorageType = {
            systemRole: this._systemRole,
            chatLog: this._chatLog,
            usage: this._usage,
        }
        this._storage.setItem('state.json', JSON.stringify(state))
    }
}

const storageType = t.type({
    systemRole: t.string,
    chatLog: t.array(t.any),
    usage: t.union([
        t.undefined,
        t.type({
            completion_tokens: t.number,
            prompt_tokens: t.number,
            total_tokens: t.number,
        })
    ])
})

type StorageType = t.TypeOf<typeof storageType>