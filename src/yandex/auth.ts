import { assertDefined, decode, resToJson, unixTimestamp } from "../func.js"
import { AppLogger } from "../types.js"
import yandexKey from '../key.json' assert {type: 'json'}
import jwt from 'jsonwebtoken'
import { iamToken, IamToken } from "./types.js"

const IAM_TOKEN_UPDATE_INTERVAL = 3600 * 1000

export class Auth {
    private _yandexKey: Key = yandexKey
    private _iamToken: string | undefined

    constructor(private _log: AppLogger) {
        this.updateToken()
        setInterval(() => this.updateToken(), IAM_TOKEN_UPDATE_INTERVAL)
    }

    public get iamToken() {
        return assertDefined(this._iamToken)
    }

    private updateToken() {
        const jwt = this.makeJwt()
        this.getIamToken(jwt)
            .then(x => {
                this._iamToken = x.iamToken
                this._log.info('Update IAM token successful')
            }).catch(e => this._log.error('Failed to update IAM token', e))
    }

    private async getIamToken(jwt: string): Promise<IamToken> {
        return fetch('https://iam.api.cloud.yandex.net/iam/v1/tokens', {
            method: 'post',
            body: JSON.stringify({ jwt }),
            headers: { 'Content-Type': 'application/json' }
        }).then(resToJson).then(decode(iamToken))
    }

    private makeJwt() {
        const now = unixTimestamp()
        const token = jwt.sign(
            {
                iss: this._yandexKey.service_account_id,
                aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
                iat: now,
                exp: now + 3599,
            },
            this._yandexKey.private_key,
            {
                algorithm: 'PS256',
                header: {
                    typ: "JWT",
                    alg: "PS256",
                    kid: this._yandexKey.id,
                }
            })
        return token
    }
}

interface Key {
    id: string
    service_account_id: string
    created_at: string
    key_algorithm: string
    public_key: string
    private_key: string
}
