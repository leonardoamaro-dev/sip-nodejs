"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transport = void 0;
var tslib_1 = require("tslib");
var events_1 = require("events");
var emitter_1 = require("../../api/emitter");
var exceptions_1 = require("../../api/exceptions");
var transport_state_1 = require("../../api/transport-state");
var core_1 = require("../../core");
/**
 * Transport for SIP over secure WebSocket (WSS).
 * @public
 */
var Transport = /** @class */ (function (_super) {
    tslib_1.__extends(Transport, _super);
    function Transport(logger, options) {
        var _this = _super.call(this) || this;
        _this._state = transport_state_1.TransportState.Disconnected;
        _this._stateEventEmitter = new events_1.EventEmitter();
        _this.transitioningState = false;
        // logger
        _this.logger = logger;
        // guard deprecated options (remove this in version 16.x)
        if (options) {
            var optionsDeprecated = options;
            var wsServersDeprecated = optionsDeprecated.wsServers;
            var maxReconnectionAttemptsDeprecated = optionsDeprecated.maxReconnectionAttempts;
            if (wsServersDeprecated !== undefined) {
                var deprecatedMessage = "The transport option \"wsServers\" as has apparently been specified and has been deprecated. " +
                    "It will no longer be available starting with SIP.js release 0.16.0. Please update accordingly.";
                _this.logger.warn(deprecatedMessage);
            }
            if (maxReconnectionAttemptsDeprecated !== undefined) {
                var deprecatedMessage = "The transport option \"maxReconnectionAttempts\" as has apparently been specified and has been deprecated. " +
                    "It will no longer be available starting with SIP.js release 0.16.0. Please update accordingly.";
                _this.logger.warn(deprecatedMessage);
            }
            // hack
            if (wsServersDeprecated && !options.server) {
                if (typeof wsServersDeprecated === "string") {
                    options.server = wsServersDeprecated;
                }
                if (wsServersDeprecated instanceof Array) {
                    options.server = wsServersDeprecated[0];
                }
            }
        }
        // initialize configuration
        _this.configuration = tslib_1.__assign(tslib_1.__assign({}, Transport.defaultOptions), options);
        // validate server URL
        var url = _this.configuration.server;
        var parsed = core_1.Grammar.parse(url, "absoluteURI");
        if (parsed === -1) {
            _this.logger.error("Invalid WebSocket Server URL \"" + url + "\"");
            throw new Error("Invalid WebSocket Server URL");
        }
        if (["wss", "ws", "udp"].indexOf(parsed.scheme) < 0) {
            _this.logger.error("Invalid scheme in WebSocket Server URL \"" + url + "\"");
            throw new Error("Invalid scheme in WebSocket Server URL");
        }
        _this._protocol = parsed.scheme.toUpperCase();
        return _this;
    }
    Transport.prototype.dispose = function () {
        return this.disconnect();
    };
    Object.defineProperty(Transport.prototype, "protocol", {
        /**
         * The protocol.
         *
         * @remarks
         * Formatted as defined for the Via header sent-protocol transport.
         * https://tools.ietf.org/html/rfc3261#section-20.42
         */
        get: function () {
            return this._protocol;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Transport.prototype, "server", {
        /**
         * The URL of the WebSocket Server.
         */
        get: function () {
            return this.configuration.server;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Transport.prototype, "state", {
        /**
         * Transport state.
         */
        get: function () {
            return this._state;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Transport.prototype, "stateChange", {
        /**
         * Transport state change emitter.
         */
        get: function () {
            return emitter_1._makeEmitter(this._stateEventEmitter);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Transport.prototype, "ws", {
        /**
         * The WebSocket.
         */
        get: function () {
            return this._ws;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Connect to network.
     * Resolves once connected. Otherwise rejects with an Error.
     */
    Transport.prototype.connect = function () {
        return this._connect();
    };
    /**
     * Disconnect from network.
     * Resolves once disconnected. Otherwise rejects with an Error.
     */
    Transport.prototype.disconnect = function () {
        return this._disconnect();
    };
    /**
     * Returns true if the `state` equals "Connected".
     * @remarks
     * This is equivalent to `state === TransportState.Connected`.
     */
    Transport.prototype.isConnected = function () {
        return this.state === transport_state_1.TransportState.Connected;
    };
    /**
     * Sends a message.
     * Resolves once message is sent. Otherwise rejects with an Error.
     * @param message - Message to send.
     */
    Transport.prototype.send = function (message) {
        // Error handling is independent of whether the message was a request or
        // response.
        //
        // If the transport user asks for a message to be sent over an
        // unreliable transport, and the result is an ICMP error, the behavior
        // depends on the type of ICMP error.  Host, network, port or protocol
        // unreachable errors, or parameter problem errors SHOULD cause the
        // transport layer to inform the transport user of a failure in sending.
        // Source quench and TTL exceeded ICMP errors SHOULD be ignored.
        //
        // If the transport user asks for a request to be sent over a reliable
        // transport, and the result is a connection failure, the transport
        // layer SHOULD inform the transport user of a failure in sending.
        // https://tools.ietf.org/html/rfc3261#section-18.4
        return this._send(message);
    };
    /**
     * @internal
     */
    Transport.prototype.on = function (name, callback) {
        var deprecatedMessage = "A listener has been registered for the transport event \"" + name + "\". " +
            "Registering listeners for transport events has been deprecated and will no longer be available starting with SIP.js release 0.16.0. " +
            "Please use the onConnected, onDisconnected, onMessage callbacks and/or the stateChange emitter instead. Please update accordingly.";
        this.logger.warn(deprecatedMessage);
        return _super.prototype.on.call(this, name, callback);
    };
    Transport.prototype._connect = function () {
        var _this = this;
        this.logger.log("Connecting " + this.server);
        switch (this.state) {
            case transport_state_1.TransportState.Connecting:
                // If `state` is "Connecting", `state` MUST NOT transition before returning.
                if (this.transitioningState) {
                    return Promise.reject(this.transitionLoopDetectedError(transport_state_1.TransportState.Connecting));
                }
                if (!this.connectPromise) {
                    throw new Error("Connect promise must be defined.");
                }
                return this.connectPromise; // Already connecting
            case transport_state_1.TransportState.Connected:
                // If `state` is "Connected", `state` MUST NOT transition before returning.
                if (this.transitioningState) {
                    return Promise.reject(this.transitionLoopDetectedError(transport_state_1.TransportState.Connecting));
                }
                if (this.connectPromise) {
                    throw new Error("Connect promise must not be defined.");
                }
                return Promise.resolve(); // Already connected
            case transport_state_1.TransportState.Disconnecting:
                // If `state` is "Disconnecting", `state` MUST transition to "Connecting" before returning
                if (this.connectPromise) {
                    throw new Error("Connect promise must not be defined.");
                }
                try {
                    this.transitionState(transport_state_1.TransportState.Connecting);
                }
                catch (e) {
                    if (e instanceof exceptions_1.StateTransitionError) {
                        return Promise.reject(e); // Loop detected
                    }
                    throw e;
                }
                break;
            case transport_state_1.TransportState.Disconnected:
                // If `state` is "Disconnected" `state` MUST transition to "Connecting" before returning
                if (this.connectPromise) {
                    throw new Error("Connect promise must not be defined.");
                }
                try {
                    this.transitionState(transport_state_1.TransportState.Connecting);
                }
                catch (e) {
                    if (e instanceof exceptions_1.StateTransitionError) {
                        return Promise.reject(e); // Loop detected
                    }
                    throw e;
                }
                break;
            default:
                throw new Error("Unknown state");
        }
        var ws;
        try {
            // WebSocket()
            // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket
            ws = new WebSocket(this.server, "sip");
            ws.addEventListener("close", function (ev) { return _this.onWebSocketClose(ev, ws); });
            ws.addEventListener("error", function (ev) { return _this.onWebSocketError(ev, ws); });
            ws.addEventListener("open", function (ev) { return _this.onWebSocketOpen(ev, ws); });
            ws.addEventListener("message", function (ev) { return _this.onWebSocketMessage(ev, ws); });
            this._ws = ws;
        }
        catch (error) {
            this._ws = undefined;
            this.logger.error("WebSocket construction failed.");
            return Promise.resolve()
                .then(function () {
                // The `state` MUST transition to "Disconnecting" or "Disconnected" before rejecting
                _this.transitionState(transport_state_1.TransportState.Disconnected, error);
                throw error;
            });
        }
        this.connectPromise = new Promise(function (resolve, reject) {
            _this.connectResolve = resolve;
            _this.connectReject = reject;
            _this.connectTimeout = setTimeout(function () {
                _this.logger.warn("Connect timed out. " +
                    "Exceeded time set in configuration.connectionTimeout: " + _this.configuration.connectionTimeout + "s.");
                ws.close(1000); // careful here to use a local reference instead of this._ws
            }, _this.configuration.connectionTimeout * 1000);
        });
        return this.connectPromise;
    };
    Transport.prototype._disconnect = function () {
        var _this = this;
        this.logger.log("Disconnecting " + this.server);
        switch (this.state) {
            case transport_state_1.TransportState.Connecting:
                // If `state` is "Connecting", `state` MUST transition to "Disconnecting" before returning.
                if (this.disconnectPromise) {
                    throw new Error("Disconnect promise must not be defined.");
                }
                try {
                    this.transitionState(transport_state_1.TransportState.Disconnecting);
                }
                catch (e) {
                    if (e instanceof exceptions_1.StateTransitionError) {
                        return Promise.reject(e); // Loop detected
                    }
                    throw e;
                }
                break;
            case transport_state_1.TransportState.Connected:
                // If `state` is "Connected", `state` MUST transition to "Disconnecting" before returning.
                if (this.disconnectPromise) {
                    throw new Error("Disconnect promise must not be defined.");
                }
                try {
                    this.transitionState(transport_state_1.TransportState.Disconnecting);
                }
                catch (e) {
                    if (e instanceof exceptions_1.StateTransitionError) {
                        return Promise.reject(e); // Loop detected
                    }
                    throw e;
                }
                break;
            case transport_state_1.TransportState.Disconnecting:
                // If `state` is "Disconnecting", `state` MUST NOT transition before returning.
                if (this.transitioningState) {
                    return Promise.reject(this.transitionLoopDetectedError(transport_state_1.TransportState.Disconnecting));
                }
                if (!this.disconnectPromise) {
                    throw new Error("Disconnect promise must be defined.");
                }
                return this.disconnectPromise; // Already disconnecting
            case transport_state_1.TransportState.Disconnected:
                // If `state` is "Disconnected", `state` MUST NOT transition before returning.
                if (this.transitioningState) {
                    return Promise.reject(this.transitionLoopDetectedError(transport_state_1.TransportState.Disconnecting));
                }
                if (this.disconnectPromise) {
                    throw new Error("Disconnect promise must not be defined.");
                }
                return Promise.resolve(); // Already disconnected
            default:
                throw new Error("Unknown state");
        }
        if (!this._ws) {
            throw new Error("WebSocket must be defined.");
        }
        var ws = this._ws;
        this.disconnectPromise = new Promise(function (resolve, reject) {
            _this.disconnectResolve = resolve;
            _this.disconnectReject = reject;
            try {
                // WebSocket.close()
                // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close
                ws.close(1000); // careful here to use a local reference instead of this._ws
            }
            catch (error) {
                // Treating this as a coding error as it apparently can only happen
                // if you pass close() invalid parameters (so it should never happen)
                _this.logger.error("WebSocket close failed.");
                _this.logger.error(error);
                throw error;
            }
        });
        return this.disconnectPromise;
    };
    Transport.prototype._send = function (message) {
        if (this.configuration.traceSip === true) {
            this.logger.log("Sending WebSocket message:\n\n" + message + "\n");
        }
        if (this._state !== transport_state_1.TransportState.Connected) {
            return Promise.reject(new Error("Not connected."));
        }
        if (!this._ws) {
            throw new Error("WebSocket undefined.");
        }
        try {
            // WebSocket.send()
            // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
            this._ws.send(message);
        }
        catch (error) {
            if (error instanceof Error) {
                return Promise.reject(error);
            }
            return Promise.reject(new Error("WebSocket send failed."));
        }
        return Promise.resolve();
    };
    /**
     * WebSocket "onclose" event handler.
     * @param ev - Event.
     */
    Transport.prototype.onWebSocketClose = function (ev, ws) {
        if (ws !== this._ws) {
            return;
        }
        var message = "WebSocket closed " + this.server + " (code: " + ev.code + ")";
        var error = !this.disconnectPromise ? new Error(message) : undefined;
        if (error) {
            this.logger.warn("WebSocket closed unexpectedly");
        }
        this.logger.log(message);
        // We are about to transition to disconnected, so clear our web socket
        this._ws = undefined;
        // The `state` MUST transition to "Disconnected" before resolving (assuming `state` is not already "Disconnected").
        this.transitionState(transport_state_1.TransportState.Disconnected, error);
    };
    /**
     * WebSocket "onerror" event handler.
     * @param ev - Event.
     */
    Transport.prototype.onWebSocketError = function (ev, ws) {
        if (ws !== this._ws) {
            return;
        }
        this.logger.error("WebSocket error occurred.");
    };
    /**
     * WebSocket "onmessage" event handler.
     * @param ev - Event.
     */
    Transport.prototype.onWebSocketMessage = function (ev, ws) {
        if (ws !== this._ws) {
            return;
        }
        var data = ev.data;
        var finishedData;
        // CRLF Keep Alive response from server. Clear our keep alive timeout.
        if (/^(\r\n)+$/.test(data)) {
            this.clearKeepAliveTimeout();
            if (this.configuration.traceSip === true) {
                this.logger.log("Received WebSocket message with CRLF Keep Alive response");
            }
            return;
        }
        if (!data) {
            this.logger.warn("Received empty message, discarding...");
            return;
        }
        if (typeof data !== "string") { // WebSocket binary message.
            try {
                // TODO: UInt8Array is not an Array<number>, so this should be fixed. (It was ported as is.)
                finishedData = String.fromCharCode.apply(null, new Uint8Array(data));
            }
            catch (err) {
                this.logger.warn("Received WebSocket binary message failed to be converted into string, message discarded");
                return;
            }
            if (this.configuration.traceSip === true) {
                this.logger.log("Received WebSocket binary message:\n\n" + data + "\n");
            }
        }
        else { // WebSocket text message.
            if (this.configuration.traceSip === true) {
                this.logger.log("Received WebSocket text message:\n\n" + data + "\n");
            }
            finishedData = data;
        }
        if (this.state !== transport_state_1.TransportState.Connected) {
            this.logger.warn("Received message while not connected, discarding...");
            return;
        }
        if (this.onMessage) {
            try {
                this.onMessage(finishedData);
            }
            catch (e) {
                this.logger.error(e);
                this.logger.error("Exception thrown by onMessage callback");
                throw e; // rethrow unhandled exception
            }
        }
        this.emit("message", finishedData);
    };
    /**
     * WebSocket "onopen" event handler.
     * @param ev - Event.
     */
    Transport.prototype.onWebSocketOpen = function (ev, ws) {
        if (ws !== this._ws) {
            return;
        }
        if (this._state === transport_state_1.TransportState.Connecting) {
            this.logger.log("WebSocket opened " + this.server);
            this.transitionState(transport_state_1.TransportState.Connected);
        }
    };
    /**
     * Helper function to generate an Error.
     * @param state State transitioning to.
     */
    Transport.prototype.transitionLoopDetectedError = function (state) {
        var message = "A state transition loop has been detected.";
        message += " An attempt to transition from " + this._state + " to " + state + " before the prior transition completed.";
        message += " Perhaps you are synchronously calling connect() or disconnect() from a callback or state change handler?";
        this.logger.error(message);
        return new exceptions_1.StateTransitionError("Loop detected.");
    };
    /**
     * Transition transport state.
     * @internal
     */
    Transport.prototype.transitionState = function (newState, error) {
        var _this = this;
        var invalidTransition = function () {
            throw new Error("Invalid state transition from " + _this._state + " to " + newState);
        };
        if (this.transitioningState) {
            throw this.transitionLoopDetectedError(newState);
        }
        this.transitioningState = true;
        // Validate state transition
        switch (this._state) {
            case transport_state_1.TransportState.Connecting:
                if (newState !== transport_state_1.TransportState.Connected &&
                    newState !== transport_state_1.TransportState.Disconnecting &&
                    newState !== transport_state_1.TransportState.Disconnected) {
                    invalidTransition();
                }
                break;
            case transport_state_1.TransportState.Connected:
                if (newState !== transport_state_1.TransportState.Disconnecting &&
                    newState !== transport_state_1.TransportState.Disconnected) {
                    invalidTransition();
                }
                break;
            case transport_state_1.TransportState.Disconnecting:
                if (newState !== transport_state_1.TransportState.Connecting &&
                    newState !== transport_state_1.TransportState.Disconnected) {
                    invalidTransition();
                }
                break;
            case transport_state_1.TransportState.Disconnected:
                if (newState !== transport_state_1.TransportState.Connecting) {
                    invalidTransition();
                }
                break;
            default:
                throw new Error("Unknown state.");
        }
        // Update state
        var oldState = this._state;
        this._state = newState;
        // Local copies of connect promises (guarding against callbacks changing them indirectly)
        var connectPromise = this.connectPromise;
        var connectResolve = this.connectResolve;
        var connectReject = this.connectReject;
        // Reset connect promises if no longer connecting
        if (oldState === transport_state_1.TransportState.Connecting) {
            this.connectPromise = undefined;
            this.connectResolve = undefined;
            this.connectReject = undefined;
        }
        // Local copies of disconnect promises (guarding against callbacks changing them indirectly)
        var disconnectPromise = this.disconnectPromise;
        var disconnectResolve = this.disconnectResolve;
        var disconnectReject = this.disconnectReject;
        // Reset disconnect promises if no longer disconnecting
        if (oldState === transport_state_1.TransportState.Disconnecting) {
            this.disconnectPromise = undefined;
            this.disconnectResolve = undefined;
            this.disconnectReject = undefined;
        }
        // Clear any outstanding connect timeout
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = undefined;
        }
        this.logger.log("Transitioned from " + oldState + " to " + this._state);
        this._stateEventEmitter.emit("event", this._state);
        //  Transition to Connected
        if (newState === transport_state_1.TransportState.Connected) {
            this.startSendingKeepAlives();
            if (this.onConnect) {
                try {
                    this.onConnect();
                }
                catch (e) {
                    this.logger.error(e);
                    this.logger.error("Exception thrown by onConnect callback");
                    throw e; // rethrow unhandled exception
                }
            }
        }
        //  Transition from Connected
        if (oldState === transport_state_1.TransportState.Connected) {
            this.stopSendingKeepAlives();
            if (this.onDisconnect) {
                try {
                    if (error) {
                        this.onDisconnect(error);
                    }
                    else {
                        this.onDisconnect();
                    }
                }
                catch (e) {
                    this.logger.error(e);
                    this.logger.error("Exception thrown by onDisconnect callback");
                    throw e; // rethrow unhandled exception
                }
            }
        }
        // Legacy transport behavior (or at least what I believe the legacy transport was shooting for)
        switch (newState) {
            case transport_state_1.TransportState.Connecting:
                this.emit("connecting");
                break;
            case transport_state_1.TransportState.Connected:
                this.emit("connected");
                break;
            case transport_state_1.TransportState.Disconnecting:
                this.emit("disconnecting");
                break;
            case transport_state_1.TransportState.Disconnected:
                this.emit("disconnected");
                break;
            default:
                throw new Error("Unknown state.");
        }
        // Complete connect promise
        if (oldState === transport_state_1.TransportState.Connecting) {
            if (!connectResolve) {
                throw new Error("Connect resolve undefined.");
            }
            if (!connectReject) {
                throw new Error("Connect reject undefined.");
            }
            newState === transport_state_1.TransportState.Connected ? connectResolve() : connectReject(error || new Error("Connect aborted."));
        }
        // Complete disconnect promise
        if (oldState === transport_state_1.TransportState.Disconnecting) {
            if (!disconnectResolve) {
                throw new Error("Disconnect resolve undefined.");
            }
            if (!disconnectReject) {
                throw new Error("Disconnect reject undefined.");
            }
            newState === transport_state_1.TransportState.Disconnected ? disconnectResolve() : disconnectReject(error || new Error("Disconnect aborted."));
        }
        this.transitioningState = false;
    };
    // TODO: Review "KeepAlive Stuff".
    // It is not clear if it works and there are no tests for it.
    // It was blindly lifted the keep alive code unchanged from earlier transport code.
    //
    // From the RFC...
    //
    // SIP WebSocket Clients and Servers may keep their WebSocket
    // connections open by sending periodic WebSocket "Ping" frames as
    // described in [RFC6455], Section 5.5.2.
    // ...
    // The indication and use of the CRLF NAT keep-alive mechanism defined
    // for SIP connection-oriented transports in [RFC5626], Section 3.5.1 or
    // [RFC6223] are, of course, usable over the transport defined in this
    // specification.
    // https://tools.ietf.org/html/rfc7118#section-6
    //
    // and...
    //
    // The Ping frame contains an opcode of 0x9.
    // https://tools.ietf.org/html/rfc6455#section-5.5.2
    //
    // ==============================
    // KeepAlive Stuff
    // ==============================
    Transport.prototype.clearKeepAliveTimeout = function () {
        if (this.keepAliveDebounceTimeout) {
            clearTimeout(this.keepAliveDebounceTimeout);
        }
        this.keepAliveDebounceTimeout = undefined;
    };
    /**
     * Send a keep-alive (a double-CRLF sequence).
     */
    Transport.prototype.sendKeepAlive = function () {
        var _this = this;
        if (this.keepAliveDebounceTimeout) {
            // We already have an outstanding keep alive, do not send another.
            return Promise.resolve();
        }
        this.keepAliveDebounceTimeout = setTimeout(function () {
            _this.clearKeepAliveTimeout();
        }, this.configuration.keepAliveDebounce * 1000);
        return this.send("\r\n\r\n");
    };
    /**
     * Start sending keep-alives.
     */
    Transport.prototype.startSendingKeepAlives = function () {
        var _this = this;
        // Compute an amount of time in seconds to wait before sending another keep-alive.
        var computeKeepAliveTimeout = function (upperBound) {
            var lowerBound = upperBound * 0.8;
            return 1000 * (Math.random() * (upperBound - lowerBound) + lowerBound);
        };
        if (this.configuration.keepAliveInterval && !this.keepAliveInterval) {
            this.keepAliveInterval = setInterval(function () {
                _this.sendKeepAlive();
                _this.startSendingKeepAlives();
            }, computeKeepAliveTimeout(this.configuration.keepAliveInterval));
        }
    };
    /**
     * Stop sending keep-alives.
     */
    Transport.prototype.stopSendingKeepAlives = function () {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }
        if (this.keepAliveDebounceTimeout) {
            clearTimeout(this.keepAliveDebounceTimeout);
        }
        this.keepAliveInterval = undefined;
        this.keepAliveDebounceTimeout = undefined;
    };
    Transport.defaultOptions = {
        server: "",
        connectionTimeout: 5,
        keepAliveInterval: 0,
        keepAliveDebounce: 10,
        traceSip: true
    };
    return Transport;
}(events_1.EventEmitter));
exports.Transport = Transport;
