"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAgentState = void 0;
/**
 * {@link UserAgent} state.
 * @remarks
 * Valid state transitions:
 * ```
 * 1. "Started" --> "Stopped"
 * 2. "Stopped" --> "Started"
 * ```
 * @public
 */
var UserAgentState;
(function (UserAgentState) {
    UserAgentState["Started"] = "Started";
    UserAgentState["Stopped"] = "Stopped";
})(UserAgentState = exports.UserAgentState || (exports.UserAgentState = {}));
