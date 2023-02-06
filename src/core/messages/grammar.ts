import * as pegGrammar from "../../grammar/dist/grammar";

import { NameAddrHeader } from "./name-addr-header";
import { URI } from "./uri";

/**
 * Grammar.
 * @internal
 */
export namespace Grammar {

  /**
   * Parse.
   * @param input -
   * @param startRule -
   */
  export function parse(input: string, startRule: string): any {
    const options: any = {startRule};

    try {
      pegGrammar.parse(input, options);
    } catch (e) {
      options.data = -1;
    }
    return options.data;
  }

  /**
   * Parse the given string and returns a SIP.NameAddrHeader instance or undefined if
   * it is an invalid NameAddrHeader.
   * @param name_addr_header -
   */
  export function nameAddrHeaderParse(nameAddrHeader: string): NameAddrHeader | undefined {
    const parsedNameAddrHeader: any = Grammar.parse(nameAddrHeader, "Name_Addr_Header");

    return parsedNameAddrHeader !== -1 ? (parsedNameAddrHeader as NameAddrHeader) : undefined;
  }

  /**
   * Parse the given string and returns a SIP.URI instance or undefined if
   * it is an invalid URI.
   * @param uri -
   */
  export function URIParse(uri: string): URI | undefined {
    const parsedUri: any = Grammar.parse(uri, "SIP_URI");

    return parsedUri !== -1 ? (parsedUri as URI) : undefined;
  }
}
