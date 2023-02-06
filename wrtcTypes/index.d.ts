/// <reference types="node" />
interface  RTCPeerConnection {

    constructor(options?: any, callback?: () => void);

}

interface  mediaDevices {

    // constructor(options?: any, callback?: () => void);

    getUserMedia(constraints?: any): any;

}
  


export { mediaDevices, RTCPeerConnection};