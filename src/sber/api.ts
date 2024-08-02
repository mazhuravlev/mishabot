import { decode } from '../func.js'
import * as uuid from 'uuid'
import {
    accessTokenType,
    CompletionConfig,
    completionType,
    sttResultType,
} from './types.js'
import { AppLogger } from '../types.js'
import { formatDistanceToNow } from 'date-fns'

const sberTokenUpdateIntervalMinutes = 10

export class Api {
    private _accessToken = {
        GIGACHAT_API_PERS: '',
        SALUTE_SPEECH_PERS: '',
    }
    private _tokenUpdateInterval: NodeJS.Timeout

    constructor(
        private _authStringGigachat: string,
        private _authStringSalute: string,
        private _log: AppLogger
    ) {
        void this.getAccessToken(_authStringGigachat, 'GIGACHAT_API_PERS')
        void this.getAccessToken(_authStringSalute, 'SALUTE_SPEECH_PERS')
        this._tokenUpdateInterval = setInterval(
            () => {
                void this.getAccessToken(
                    _authStringGigachat,
                    'GIGACHAT_API_PERS'
                )
                void this.getAccessToken(
                    _authStringSalute,
                    'SALUTE_SPEECH_PERS'
                )
            },
            sberTokenUpdateIntervalMinutes * 60 * 1000
        )
    }

    public dispose() {
        clearInterval(this._tokenUpdateInterval)
    }

    public async completions(config: CompletionConfig) {
        const res = await fetch(
            'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
            {
                method: 'post',
                body: JSON.stringify(config),
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${this._accessToken.GIGACHAT_API_PERS}`,
                },
            }
        )
        const json: unknown = await res.json()
        const result = decode(completionType)(json)
        return result
    }

    public async getImage(id: string) {
        return await fetch(
            `https://gigachat.devices.sberbank.ru/api/v1/files/${id}/content`,
            {
                headers: {
                    Accept: 'application/jpg',
                    Authorization: `Bearer ${this._accessToken.GIGACHAT_API_PERS}`,
                },
            }
        ).then((x) => x.arrayBuffer())
    }

    public async speak(text: string) {
        return await fetch(
            'https://smartspeech.sber.ru/rest/v1/text:synthesize?format=opus&voice=Pon_24000',
            {
                method: 'post',
                body: text,
                headers: {
                    'Content-Type': 'application/text',
                    Authorization: `Bearer ${this._accessToken.SALUTE_SPEECH_PERS}`,
                },
            }
        ).then((x) => x.arrayBuffer())
    }

    public async transcribe(voice: Uint8Array): Promise<string> {
        const json: unknown = await fetch(
            'https://smartspeech.sber.ru/rest/v1/speech:recognize',
            {
                method: 'post',
                body: voice,
                headers: {
                    'Content-Type': 'audio/ogg;codecs=opus',
                    Authorization: `Bearer ${this._accessToken.SALUTE_SPEECH_PERS}`,
                },
            }
        ).then((x) => x.json())
        const result = decode(sttResultType)(json)
        return result.result.join(' ')
    }

    private async getAccessToken(
        authString: string,
        scope: 'GIGACHAT_API_PERS' | 'SALUTE_SPEECH_PERS'
    ) {
        try {
            const accessToken = await fetch(
                'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
                {
                    method: 'post',
                    body: `scope=${scope}`,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        RqUID: uuid.v4(),
                        Authorization: `Basic ${authString}`,
                    },
                }
            )
                .then((x) => x.json())
                .then(decode(accessTokenType))
            this._accessToken[scope] = accessToken.access_token
            const expireDate = new Date(accessToken.expires_at)
            this._log.info(
                `Received Sber access token for scope ${scope}, expires in ${formatDistanceToNow(expireDate)}`
            )
        } catch (e) {
            this._log.error(
                `Failed to get Sber access token for scope ${scope}`,
                e
            )
        }
    }
}
