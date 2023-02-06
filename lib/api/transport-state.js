"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportState = void 0;
/**
 * {@link Transport} state.
 *
 * @remarks
 * The {@link Transport} behaves in a deterministic manner according to the following
 * Finite State Machine (FSM).
 * ```txt
 *                    ______________________________
 *                   |    ____________              |
 * Transport         v   v            |             |
 * Constructed -> Disconnected -> Connecting -> Connected -> Disconnecting
 *                     ^            ^    |_____________________^  |  |
 *                     |            |_____________________________|  |
 *                     |_____________________________________________|
 * ```
 * @public
 */
var TransportState;
(function (TransportState) {
    /**
     * The `connect()` method was called.
     */
    TransportState["Connecting"] = "Connecting";
    /**
     * The `connect()` method resolved.
     */
    TransportState["Connected"] = "Connected";
    /**
     * The `disconnect()` method was called.
     */
    TransportState["Disconnecting"] = "Disconnecting";
    /**
     * The `connect()` method was rejected, or
     * the `disconnect()` method completed, or
     * network connectivity was lost.
     */
    TransportState["Disconnected"] = "Disconnected";
})(TransportState = exports.TransportState || (exports.TransportState = {}));
