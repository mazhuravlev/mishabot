import { assertNonEmptyString, last } from '../../func.js'

export class AspectRatio {
    private _aspectRatioRegex = /\b(\d+\/\d+)\b/gu

    constructor(private _str: string) {}

    public get value() {
        const aspectMatches = this._str.match(this._aspectRatioRegex)
        if (aspectMatches) {
            const [width, height] = last(aspectMatches).split('/')
            assertNonEmptyString(width)
            assertNonEmptyString(height)
            return { width, height }
        } else {
            return { width: '1', height: '1' }
        }
    }

    public get sanitized() {
        return this._str.replace(this._aspectRatioRegex, '')
    }
}
