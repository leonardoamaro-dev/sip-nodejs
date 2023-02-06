import * as SIP from 'sip.js'
import RTCAudioSource from 'node-webrtc-audio-stream-source'
const fs = require('fs');


const userAgent = new SIP.UA({
  uri: "sip:test@sip.test.com",
  wsServers: "ws://sip.test.com",
  authorizationUser: "test",
  password: "test",
  traceSip: true
});

userAgent.start();
userAgent.on('registered', onMessage("registered"));
userAgent.on('unregistered', onMessage("unregistered"));
userAgent.on('registrationFailed', onMessage("registrationFailed"));
userAgent.on('message', onMessage("message"));
setTimeout(makeCall, 2000);

function makeCall() {
  var session = userAgent.invite('test2@sip.test.com', {
    sessionDescriptionHandlerOptions: {
      constraints: {
        audio: true,
        video: false
      }
    }
  });
  session.on("accepted", function (data) {
    if (session.logger.category === "sip.inviteclientcontext") {
      let pc = session.sessionDescriptionHandler.peerConnection
      const rtcAudioSource = new RTCAudioSource()
        pc.getSenders().forEach(function (sender) {
          rtcAudioSource.addStream(fs.createReadStream('test.wav'), 16, 48000, 1)
          const track = rtcAudioSource.createTrack();
          sender.replaceTrack(track)
        })

    }
  })
}


function onMessage(method) {
    return (message) => {
      console.log(method, message.body);
    }
  }