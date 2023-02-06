"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAgentRegisteredOptionTags = exports.SIPExtension = void 0;
/**
 * SIP extension support level.
 * @public
 */
var SIPExtension;
(function (SIPExtension) {
    SIPExtension["Required"] = "Required";
    SIPExtension["Supported"] = "Supported";
    SIPExtension["Unsupported"] = "Unsupported";
})(SIPExtension = exports.SIPExtension || (exports.SIPExtension = {}));
/**
 * SIP Option Tags
 * @remarks
 * http://www.iana.org/assignments/sip-parameters/sip-parameters.xhtml#sip-parameters-4
 * @public
 */
exports.UserAgentRegisteredOptionTags = {
    "100rel": true,
    "199": true,
    "answermode": true,
    "early-session": true,
    "eventlist": true,
    "explicitsub": true,
    "from-change": true,
    "geolocation-http": true,
    "geolocation-sip": true,
    "gin": true,
    "gruu": true,
    "histinfo": true,
    "ice": true,
    "join": true,
    "multiple-refer": true,
    "norefersub": true,
    "nosub": true,
    "outbound": true,
    "path": true,
    "policy": true,
    "precondition": true,
    "pref": true,
    "privacy": true,
    "recipient-list-invite": true,
    "recipient-list-message": true,
    "recipient-list-subscribe": true,
    "replaces": true,
    "resource-priority": true,
    "sdp-anat": true,
    "sec-agree": true,
    "tdialog": true,
    "timer": true,
    "uui": true // RFC 7433
};
