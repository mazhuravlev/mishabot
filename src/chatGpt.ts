import OpenAI, { toFile } from "openai";
import { first } from "./func.js";

const maxTokens = 1000

export class ChatGpt {
    private _chatLog: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    private _systemRole: string = `Ты лось, великий специалист во всех областях. Давай краткие ответы на вопросы пользователей. 
Никогда не говори, что чего-то не бывает, не существует или что-то не знаешь, в таком случае придумай ответ от себя.`

    private _openai: OpenAI;

    private _usage: OpenAI.Completions.CompletionUsage | undefined

    constructor(private _id: string, openAiKey: string) {
        this._openai = new OpenAI({
            apiKey: openAiKey,
            baseURL: 'https://api.vsegpt.ru/v1',
        })
    }

    public get id() { return this._id }

    public get usage() { return this._usage }

    public get logSize() { return this._chatLog.length }

    public get role() { return this._systemRole }

    public set role(role: string) { this._systemRole = role }

    public async query(prompt: string) {
        const params: OpenAI.Chat.ChatCompletionCreateParams = {
            messages: [
                { role: 'system', content: this._systemRole },
                ...this._chatLog,
                { role: 'user', content: prompt }
            ],
            model: 'openai/gpt-4o-mini',
            n: 1,
            max_tokens: maxTokens
        }
        const completion: OpenAI.Chat.ChatCompletion = await this._openai.chat.completions.create(params)
        this._chatLog.push({ role: 'user', content: prompt })
        this._chatLog.push(first(completion.choices).message)
        this.updateUsage(completion)
        return completion
    }

    public async exerpt(apply: boolean) {
        const completion = await this.query('Сделай выжимку из нашей беседы.')
        const answer = first(completion.choices)
        if (apply) {
            this._chatLog = [answer.message]
        }
        this.updateUsage(completion)

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
            max_tokens: 1000,
        }
        const completion = await this._openai.chat.completions.create(params)
        this.updateUsage(completion)
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

    private updateUsage(completion: OpenAI.Chat.Completions.ChatCompletion) {
        if (completion.usage) {
            this._usage = completion.usage;
        }
    }

    public pushContext(message: OpenAI.Chat.Completions.ChatCompletionMessageParam) {
        this._chatLog.push(message)
    }
}