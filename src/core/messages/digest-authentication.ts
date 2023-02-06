import MD5 from "crypto-js/md5";

import { Logger, LoggerFactory } from "../log";
import { OutgoingRequestMessage } from "./outgoing-request-message";
import { URI } from "./uri";
import { createRandomToken } from "./utils";

/**
 * Digest Authentication.
 * @internal
 */
export class DigestAuthentication {
  public stale: boolean | undefined;

  private logger: Logger;
  private username: string | undefined;
  private password: string | undefined;
  private cnonce: string | undefined;
  private nc: number;
  private ncHex: string;
  private response: any | undefined; // CryptoJS.WordArray
  private algorithm: string | undefined;
  private realm: string | undefined;
  private nonce: string | undefined;
  private opaque: string | undefined;
  private qop: string | undefined;
  private method: string | undefined;
  private uri: string | URI | undefined;

  /**
   * Constructor.
   * @param loggerFactory - LoggerFactory.
   * @param username - Username.
   * @param password - Password.
   */
  constructor(loggerFactory: LoggerFactory, username: string | undefined, password: string | undefined) {
    this.logger = loggerFactory.getLogger("sipjs.digestauthentication");
    this.username = username;
    this.password = password;
    this.nc = 0;
    this.ncHex = "00000000";
  }

  /**
   * Performs Digest authentication given a SIP request and the challenge
   * received in a response to that request.
   * @param request -
   * @param challenge -
   * @returns true if credentials were successfully generated, false otherwise.
   */
  public authenticate(request: OutgoingRequestMessage, challenge: any, body?: string): boolean {
    // Inspect and validate the challenge.

    this.algorithm = challenge.algorithm;
    this.realm = challenge.realm;
    this.nonce = challenge.nonce;
    this.opaque = challenge.opaque;
    this.stale = challenge.stale;

    if (this.algorithm) {
      if (this.algorithm !== "MD5") {
        this.logger.warn("challenge with Digest algorithm different than 'MD5', authentication aborted");
        return false;
      }
    } else {
      this.algorithm = "MD5";
    }

    if (!this.realm) {
      this.logger.warn("challenge without Digest realm, authentication aborted");
      return false;
    }

    if (! this.nonce) {
      this.logger.warn("challenge without Digest nonce, authentication aborted");
      return false;
    }

    // 'qop' can contain a list of values (Array). Let's choose just one.
    if (challenge.qop) {
      if (challenge.qop.indexOf("auth") > -1) {
        this.qop = "auth";
      } else if (challenge.qop.indexOf("auth-int") > -1) {
        this.qop = "auth-int";
      } else {
        // Otherwise 'qop' is present but does not contain 'auth' or 'auth-int', so abort here.
        this.logger.warn("challenge without Digest qop different than 'auth' or 'auth-int', authentication aborted");
        return false;
      }
    } else {
      this.qop = undefined;
    }

    // Fill other attributes.

    this.method = request.method;
    this.uri = request.ruri;
    this.cnonce = createRandomToken(12);
    this.nc += 1;
    this.updateNcHex();

    // nc-value = 8LHEX. Max value = 'FFFFFFFF'.
    if (this.nc === 4294967296) {
      this.nc = 1;
      this.ncHex = "00000001";
    }

    // Calculate the Digest "response" value.
    this.calculateResponse(body);

    return true;
  }

  /**
   * Return the Proxy-Authorization or WWW-Authorization header value.
   */
  public toString(): string {
    const authParams: Array<string> = [];

    if (! this.response) {
      throw new Error("response field does not exist, cannot generate Authorization header");
    }

    authParams.push("algorithm=" + this.algorithm);
    authParams.push('username="' + this.username + '"');
    authParams.push('realm="' + this.realm + '"');
    authParams.push('nonce="' + this.nonce + '"');
    authParams.push('uri="' + this.uri + '"');
    authParams.push('response="' + this.response + '"');
    if (this.opaque) {
      authParams.push('opaque="' + this.opaque + '"');
    }
    if (this.qop) {
      authParams.push("qop=" + this.qop);
      authParams.push('cnonce="' + this.cnonce + '"');
      authParams.push("nc=" + this.ncHex);
    }

    return "Digest " + authParams.join(", ");
  }
  /**
   * Generate the 'nc' value as required by Digest in this.ncHex by reading this.nc.
   */
  private updateNcHex(): void {
    const hex = Number(this.nc).toString(16);
    this.ncHex = "00000000".substr(0, 8 - hex.length) + hex;
  }

  /**
   * Generate Digest 'response' value.
   */
  private calculateResponse(body?: string): void {
    let ha2;

    // HA1 = MD5(A1) = MD5(username:realm:password)
    const ha1 = MD5(this.username + ":" + this.realm + ":" + this.password);

    if (this.qop === "auth") {
      // HA2 = MD5(A2) = MD5(method:digestURI)
      ha2 = MD5(this.method + ":" + this.uri);
      // response = MD5(HA1:nonce:nonceCount:credentialsNonce:qop:HA2)
      this.response = MD5(ha1 + ":" + this.nonce + ":" + this.ncHex + ":" + this.cnonce + ":auth:" + ha2);

    } else if (this.qop === "auth-int") {
      // HA2 = MD5(A2) = MD5(method:digestURI:MD5(entityBody))
      ha2 = MD5(this.method + ":" + this.uri + ":" + MD5(body ? body : ""));
      // response = MD5(HA1:nonce:nonceCount:credentialsNonce:qop:HA2)
      this.response = MD5(ha1 + ":" + this.nonce + ":" + this.ncHex + ":" + this.cnonce + ":auth-int:" + ha2);

    } else if (this.qop === undefined) {
      // HA2 = MD5(A2) = MD5(method:digestURI)
      ha2 = MD5(this.method + ":" + this.uri);
      // response = MD5(HA1:nonce:HA2)
      this.response = MD5(ha1 + ":" + this.nonce + ":" + ha2);
    }
  }
}
