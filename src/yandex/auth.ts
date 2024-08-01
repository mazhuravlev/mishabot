import { assertDefined, decode, resToJson, unixTimestamp } from '../func.js'
import { AppLogger } from '../types.js'
import jwt from 'jsonwebtoken'
import { iamToken, IamToken, YandexKey } from './types.js'

const IAM_TOKEN_UPDATE_INTERVAL = 3600 * 1000

export class Auth {
    private _iamToken: string | undefined

    constructor(
        private _yandexKey: YandexKey,
        private _log: AppLogger
    ) {
        this.updateToken()
        setInterval(() => this.updateToken(), IAM_TOKEN_UPDATE_INTERVAL)
    }

    public get iamToken() {
        return assertDefined(this._iamToken)
    }

    private updateToken() {
        const jwt = this.makeJwt()
        this.getIamToken(jwt)
            .then((x) => {
                this._iamToken = x.iamToken
                this._log.info('Update IAM token successful')
            })
            .catch((e) => this._log.error('Failed to update IAM token', e))
    }

    private async getIamToken(jwt: string): Promise<IamToken> {
        return fetch('https://iam.api.cloud.yandex.net/iam/v1/tokens', {
            method: 'post',
            body: JSON.stringify({ jwt }),
            headers: { 'Content-Type': 'application/json' },
        })
            .then(resToJson)
            .then(decode(iamToken))
    }

    private makeJwt() {
        const now = unixTimestamp()
        const token = jwt.sign(
            {
                iss: this._yandexKey.service_account_id,
                aud: 'https://iam.api.cloud.yandex.net/iam/v1/tokens',
                iat: now,
                exp: now + 3599,
            },
            this._yandexKey.private_key,
            {
                algorithm: 'PS256',
                header: {
                    typ: 'JWT',
                    alg: 'PS256',
                    kid: this._yandexKey.id,
                },
            }
        )
        return token
    }
}
