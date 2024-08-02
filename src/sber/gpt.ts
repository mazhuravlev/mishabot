import { first } from '../func.js'
import { AppLogger } from '../types.js'
import { Api } from './api.js'
import { CompletionConfig, Message } from './types.js'

export class Gpt {
    private _messages: Message[] = []
    private _systemRole = ''

    constructor(
        private _id: string,
        private _api: Api,
        private _log: AppLogger,
        defaultSystemRole: string
    ) {
        this._systemRole = defaultSystemRole
    }

    public get api() {
        return this._api
    }

    public async query(
        prompt: string,
        config: PartialConfig,
        useContext: boolean
    ) {
        const userMessage: Message = { role: 'user', content: prompt }
        const messages: Message[] = useContext
            ? [
                  { role: 'system', content: this._systemRole },
                  ...this._messages,
                  userMessage,
              ]
            : [userMessage]
        const completion = await this._api.completions({
            ...defaultConfig,
            ...config,
            messages,
        })
        if (useContext) {
            this._messages.push(userMessage)
            const choice = first(completion.choices)
            this._messages.push({
                role: 'assistant',
                content: choice.message.content,
            })
        }
        return completion
    }

    public addUserContext(content: string, _name: string | undefined) {
        this._messages.push({
            role: 'user',
            content,
        })
    }
}

type PartialConfig = Partial<Omit<CompletionConfig, 'messages'>>
const defaultConfig: Omit<CompletionConfig, 'messages'> = {
    model: 'GigaChat',
    temperature: 0.5,
    max_tokens: 300,
}
