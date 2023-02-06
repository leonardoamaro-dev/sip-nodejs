# SIP.js

This repository forked from onsip/SIP.js v0.15.10

I use node-webrtc/node-webrtc and websockets/ws instead of native ws rtc api on browser.

So it can run on nodejs env.

## Download

* npm: `npm install git:https://github.com/Winston87245/SIP.js.git#node-environment`

## How to use

Audio can be played during a call.
For reference on how this is done please see ylerlong/node-webrtc-audio-stream-source 

and see ./example/PlayAudio.js

## Note
You will need to confirm that your audio file codec is supported.

## License
MIT
