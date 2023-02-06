"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageUserAgentClient = void 0;
var tslib_1 = require("tslib");
var transactions_1 = require("../transactions");
var user_agent_client_1 = require("./user-agent-client");
/**
 * MESSAGE UAS.
 * @public
 */
var MessageUserAgentClient = /** @class */ (function (_super) {
    tslib_1.__extends(MessageUserAgentClient, _super);
    function MessageUserAgentClient(core, message, delegate) {
        return _super.call(this, transactions_1.NonInviteClientTransaction, core, message, delegate) || this;
    }
    return MessageUserAgentClient;
}(user_agent_client_1.UserAgentClient));
exports.MessageUserAgentClient = MessageUserAgentClient;
