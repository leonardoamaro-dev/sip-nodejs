"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DTMF = void 0;
var tslib_1 = require("tslib");
var info_1 = require("./info");
/**
 * A DTMF signal (incoming INFO).
 * @deprecated Use `Info`.
 * @internal
 */
var DTMF = /** @class */ (function (_super) {
    tslib_1.__extends(DTMF, _super);
    /** @internal */
    function DTMF(incomingInfoRequest, tone, duration) {
        var _this = _super.call(this, incomingInfoRequest) || this;
        _this._tone = tone;
        _this._duration = duration;
        return _this;
    }
    Object.defineProperty(DTMF.prototype, "tone", {
        get: function () {
            return this._tone;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(DTMF.prototype, "duration", {
        get: function () {
            return this._duration;
        },
        enumerable: false,
        configurable: true
    });
    return DTMF;
}(info_1.Info));
exports.DTMF = DTMF;
