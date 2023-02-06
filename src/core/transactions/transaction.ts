import { EventEmitter } from "events";

import { TransportError } from "../exceptions";
import { Logger } from "../log";
import { Transport } from "../transport";
import { TransactionState } from "./transaction-state";
import { TransactionUser } from "./transaction-user";

/**
 * Transaction.
 * @remarks
 * SIP is a transactional protocol: interactions between components take
 * place in a series of independent message exchanges.  Specifically, a
 * SIP transaction consists of a single request and any responses to
 * that request, which include zero or more provisional responses and
 * one or more final responses.  In the case of a transaction where the
 * request was an INVITE (known as an INVITE transaction), the
 * transaction also includes the ACK only if the final response was not
 * a 2xx response.  If the response was a 2xx, the ACK is not considered
 * part of the transaction.
 * https://tools.ietf.org/html/rfc3261#section-17
 * @public
 */
export abstract class Transaction extends EventEmitter {
  protected logger: Logger;

  protected constructor(
    private _transport: Transport,
    private _user: TransactionUser,
    private _id: string,
    private _state: TransactionState,
    loggerCategory: string,
  ) {
    super();
    this.logger = _user.loggerFactory.getLogger(loggerCategory, _id);
    this.logger.debug(`Constructing ${this.typeToString()} with id ${this.id}.`);
  }

  /**
   * Destructor.
   * Once the transaction is in the "terminated" state, it is destroyed
   * immediately and there is no need to call `dispose`. However, if a
   * transaction needs to be ended prematurely, the transaction user may
   * do so by calling this method (for example, perhaps the UA is shutting down).
   * No state transition will occur upon calling this method, all outstanding
   * transmission timers will be cancelled, and use of the transaction after
   * calling `dispose` is undefined.
   */
  public dispose(): void {
    this.logger.debug(`Destroyed ${this.typeToString()} with id ${this.id}.`);
  }

  /** Transaction id. */
  get id(): string {
    return this._id;
  }

  /** Transaction kind. Deprecated. */
  get kind(): string {
    throw new Error("Invalid kind.");
  }

  /** Transaction state. */
  get state(): TransactionState {
    return this._state;
  }

  /** Transaction transport. */
  get transport(): Transport {
    return this._transport;
  }

  /** Subscribe to 'stateChanged' event. */
  public on(name: "stateChanged", callback: () => void): this;
  public on(name: string, callback: (...args: any[]) => void): this  { return super.on(name, callback); }

  protected logTransportError(error: TransportError, message: string): void {
    this.logger.error(error.message);
    this.logger.error(`Transport error occurred in ${this.typeToString()} with id ${this.id}.`);
    this.logger.error(message);
  }

  protected abstract onTransportError(error: TransportError): void;

  /**
   * Pass message to transport for transmission. If transport fails,
   * the transaction user is notified by callback to onTransportError().
   * @returns
   * Rejects with `TransportError` if transport fails.
   */
  protected send(message: string): Promise<void> {
    return this.transport.send(message).catch((error) => {
      // If the transport rejects, it SHOULD reject with a TransportError.
      // But the transport may be external code, so we are careful
      // make sure we convert it to a TransportError if need be.
      if (error instanceof TransportError) {
        this.onTransportError(error);
        throw error;
      }
      let transportError: TransportError;
      if (error && typeof error.message === "string") {
        transportError = new TransportError(error.message);
      } else {
        transportError = new TransportError();
      }
      this.onTransportError(transportError);
      throw transportError;
    });
  }

  protected setState(state: TransactionState): void {
    this.logger.debug(`State change to "${state}" on ${this.typeToString()} with id ${this.id}.`);
    this._state = state;
    if (this._user.onStateChange) {
      this._user.onStateChange(state);
    }
    this.emit("stateChanged");
  }

  protected typeToString(): string {
    return "UnknownType";
  }
}
