import {
  Notification,
  Subscriber,
  Subscription,
  SubscriptionDelegate,
  SubscriptionState
} from "../../../src/api";
import {
  C,
  Dialog,
  DialogState,
  IncomingRequestMessage,
  NonInviteClientTransaction,
  ReSubscribeUserAgentServer,
  Timers,
  URI,
  UserAgentClient,
  UserAgentCore
} from "../../../src/core";
import { newTag } from "../../../src/core/messages/utils";
import { EmitterSpy, makeEmitterSpy } from "../../support/api/emitter-spy";
import { connectUserFake, makeUserFake, UserFake } from "../../support/api/user-fake";
import { soon } from "../../support/api/utils";

// tslint:disable-next-line:max-classes-per-file
class NotifierDialog extends Dialog {
  constructor(protected core: UserAgentCore, protected dialogState: DialogState) {
    super(core, dialogState);
  }
}

const SIP_SUBSCRIBE = [jasmine.stringMatching(/^SUBSCRIBE/)];
const SIP_200 = [jasmine.stringMatching(/^SIP\/2.0 200/)];
const SIP_481 = [jasmine.stringMatching(/^SIP\/2.0 481/)];
const SIP_489 = [jasmine.stringMatching(/^SIP\/2.0 489/)];

describe("API Subscription", () => {
  let alice: UserFake;
  let bob: UserFake;
  let target: URI;
  let subscriber: Subscriber;
  let subscription: Subscription;
  let subscriptionStateSpy: EmitterSpy<SubscriptionState>;

  const subscriptionDelegateMock =
    jasmine.createSpyObj<Required<SubscriptionDelegate>>("SubscriptionDelegate", [
      "onNotify"
    ]);
  subscriptionDelegateMock.onNotify.and.callFake((notification: Notification) => {
    notification.accept();
  });

  const event = "foo";

  function resetSpies(): void {
    alice.transportReceiveSpy.calls.reset();
    alice.transportSendSpy.calls.reset();
    subscriptionStateSpy.calls.reset();
    subscriptionDelegateMock.onNotify.calls.reset();
  }

  beforeEach(async () => {
    jasmine.clock().install();
    alice = await makeUserFake("alice", "example.com", "Alice");
    bob = await makeUserFake("bob", "example.com", "Bob");
    connectUserFake(alice, bob);
    target = bob.uri;
  });

  afterEach(async () => {
    return alice.userAgent.stop()
      .then(() => expect(alice.isShutdown()).toBe(true))
      .then(() => bob.userAgent.stop())
      .then(() => expect(bob.isShutdown()).toBe(true))
      .then(() => jasmine.clock().uninstall());
  });

  describe("Alice constructs a new subscription targeting Bob", () => {
    beforeEach(() => {
      subscription = subscriber = new Subscriber(
        alice.userAgent,
        target,
        event,
        { delegate: subscriptionDelegateMock }
      );
      subscriptionStateSpy = makeEmitterSpy(subscription.stateChange, alice.userAgent.getLogger("Alice"));
    });

    it("the subscription delegate should not be called", () => {
      const spy = subscriptionDelegateMock;
      expect(spy.onNotify).toHaveBeenCalledTimes(0);
    });

    it("the subscription state should not change", () => {
      expect(subscription.state).toBe(SubscriptionState.Initial);
      expect(subscriptionStateSpy).not.toHaveBeenCalled();
    });

    describe("Alice calls subscribe() to send a SUBSCRIBE request", () => {
      beforeEach(() => {
        resetSpies();
        subscriber.subscribe();
      });

      it("the subscriber should send a SUBSCRIBE", () => {
        const spy = alice.transportSendSpy;
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.calls.argsFor(0)).toEqual(SIP_SUBSCRIBE);
      });

      it("the subscription delegate should not be called", () => {
        const spy = subscriptionDelegateMock;
        expect(spy.onNotify).toHaveBeenCalledTimes(0);
      });

      it("the subscription state should transition to 'notify wait'", () => {
        const spy = subscriptionStateSpy;
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.NotifyWait]);
      });

      describe("Bob never responds to the request", () => {
        beforeEach(() => {
          resetSpies();
          bob.userAgent.delegate = {
            onSubscribeRequest: (request) => {
              return;
            }
          };
        });

        // Note: There is a potential race condition here between 2 timers which are both 64 * T1
        // - Timer F, non-INVITE transaction timeout, which will trigger a 408 response
        // - Timer N, NOTIFY wait timeout, which will not trigger a response
        // It boils down to an implementation choice to break the race.
        // But it likely doesn't matter outside of testing.

        it("the subscription state should not change prior to timeout", async () => {
          await soon(Timers.TIMER_F - 1);
          expect(subscriptionStateSpy).not.toHaveBeenCalled();
        });

        it("the subscription state should not change prior to timeout if subscribe() called twice", async () => {
          subscriber.subscribe();
          await soon(Timers.TIMER_F - 1);
          expect(subscriptionStateSpy).not.toHaveBeenCalled();
        });

        it("the subscription delegate should not be called after timeout", async () => {
          await soon(Timers.TIMER_F + 1);
          const spy = subscriptionDelegateMock;
          expect(spy.onNotify).toHaveBeenCalledTimes(0);
        });

        it("the subscription state should transition to 'terminated' after timeout", async () => {
          await soon(Timers.TIMER_F + 1);
          const spy = subscriptionStateSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
        });
      });

      describe("Bob demands authentication for the reqeust", () => {
        beforeEach(async () => {
          resetSpies();
          bob.userAgent.delegate = {
            onSubscribeRequest: (request) => {
              // tslint:disable-next-line:max-line-length
              const extraHeaders = [`Proxy-Authenticate: Digest realm="example.com", nonce="5cc8bf5800003e0181297d67d3a2e41aa964192a05e30fc4", qop="auth"`];
              request.reject({ statusCode: 407, extraHeaders });
            }
          };
          await bob.transport.waitReceived();
          await bob.transport.waitReceived();
        });

        it("the subscriber should send an SUBSCRIBE", () => {
          const spy = alice.transportSendSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual(SIP_SUBSCRIBE);
        });

        it("the subscription delegate should not be called", () => {
          const spy = subscriptionDelegateMock;
          expect(spy.onNotify).toHaveBeenCalledTimes(0);
        });

        it("the subscription state should transition to 'terminated'", () => {
          const spy = subscriptionStateSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
        });
      });

      describe("Bob rejects the request", () => {
        beforeEach(async () => {
          resetSpies();
          bob.userAgent.delegate = {
            onSubscribeRequest: (request) => {
              request.reject();
            }
          };
          await alice.transport.waitReceived();
        });

        it("the subscriber should send nothing", () => {
          const spy = alice.transportSendSpy;
          expect(spy).not.toHaveBeenCalled();
        });

        it("the subscription delegate should not be called", () => {
          const spy = subscriptionDelegateMock;
          expect(spy.onNotify).toHaveBeenCalledTimes(0);
        });

        it("the subscription state should transition to 'terminated'", () => {
          const spy = subscriptionStateSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
        });
      });

      describe("Bob sends initial NOTIFY before responding to the request", () => {
        let notifierDialog: Dialog;
        let receivedEvent: string;
        let receivedExpires: number;

        beforeEach(async () => {
          resetSpies();
          bob.userAgent.delegate = {
            onSubscribeRequest: (request) => {
              receivedEvent = request.message.parseHeader("Event").event;
              if (!receivedEvent || receivedEvent !== event) {
                request.reject({ statusCode: 489 });
                return;
              }
              if (!request.message.hasHeader("Expires")) {
                request.reject({ statusCode: 489 });
                return;
              }
              receivedExpires = Number(request.message.getHeader("Expires"));
              if (receivedExpires < 0 || isNaN(receivedExpires)) {
                request.reject({ statusCode: 489 });
                return;
              }
              const statusCode = 200;
              const toTag = newTag();
              const extraHeaders = new Array<string>();
              extraHeaders.push(`Event: ${receivedEvent}`);
              // Don't send a 200...
              // request.accept({ statusCode, toTag, extraHeaders });

              const dialogState = Dialog.initialDialogStateForUserAgentServer(request.message, toTag);
              notifierDialog = new NotifierDialog(bob.userAgent.userAgentCore, dialogState);
              extraHeaders.push(`Subscription-State: active;expires=${receivedExpires}`);
              extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
              const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
              const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            }
          };
          await bob.transport.waitReceived();
          await bob.transport.waitReceived();
        });

        afterEach(() => {
          // Not waiting for it to resolve as there is no real server to handle the unsubscribe
          subscription.dispose();
        });

        it("the subscriber should send a 200 to the NOTIFY", () => {
          const spy = alice.transportSendSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual(SIP_200);
        });

        it("the subscription delegate should onNotify()", () => {
          const spy = subscriptionDelegateMock;
          expect(spy.onNotify).toHaveBeenCalledTimes(1);
        });

        it("the subscription state should transition to 'Subscribed'", () => {
          const spy = subscriptionStateSpy;
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Subscribed]);
        });
      });

      describe("Bob accepts the request", () => {
        let notifierDialog: Dialog;
        let receivedEvent: string;
        let receivedExpires: number;

        beforeEach(async () => {
          resetSpies();
          bob.userAgent.delegate = {
            onSubscribeRequest: (request) => {
              receivedEvent = request.message.parseHeader("Event").event;
              if (!receivedEvent || receivedEvent !== event) {
                request.reject({ statusCode: 489 });
                return;
              }
              if (!request.message.hasHeader("Expires")) {
                request.reject({ statusCode: 489 });
                return;
              }
              receivedExpires = Number(request.message.getHeader("Expires"));
              if (receivedExpires < 0 || isNaN(receivedExpires)) {
                request.reject({ statusCode: 489 });
                return;
              }
              const statusCode = 200;
              const toTag = newTag();
              const extraHeaders = new Array<string>();
              extraHeaders.push(`Event: ${receivedEvent}`);
              extraHeaders.push(`Expires: ${receivedExpires}`);
              extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
              request.accept({ statusCode, toTag, extraHeaders });

              const dialogState = Dialog.initialDialogStateForUserAgentServer(request.message, toTag);
              notifierDialog = new NotifierDialog(bob.userAgent.userAgentCore, dialogState);
              // FIXME: As we don't currently have a real notifiation dialog, hack in what we need for these test
              // TODO: Should just write a proper one
              const receiveRequestOriginal = notifierDialog.receiveRequest;
              notifierDialog.receiveRequest = (message: IncomingRequestMessage): void => {
                receiveRequestOriginal.call(notifierDialog, message);
                if (message.method === C.SUBSCRIBE) {
                  const uas = new ReSubscribeUserAgentServer(notifierDialog, message);
                  const expires = Number(message.getHeader("Expires"));
                  const resubHeaders: Array<string> = [];
                  if (expires === 0) {
                    resubHeaders.push("Subscription-State: terminated");
                  } else {
                    resubHeaders.push("Expires: " + expires);
                    resubHeaders.push("Subscription-State: active");
                  }
                  uas.accept({
                    statusCode: 200,
                    extraHeaders: resubHeaders
                  });
                }
              };
            }
          };
          await alice.transport.waitReceived();
        });

        afterEach(() => {
          // Not waiting for it to resolve as there is no real server to handle the unsubscribe
          subscription.dispose();
        });

        it("the subscriber should send nothing", () => {
          const spy = alice.transportSendSpy;
          expect(spy).not.toHaveBeenCalled();
        });

        it("the subscription delegate should not be called", () => {
          const spy = subscriptionDelegateMock;
          expect(spy.onNotify).toHaveBeenCalledTimes(0);
        });

        it("the subscription state should not change", () => {
          expect(subscriptionStateSpy).not.toHaveBeenCalled();
        });

        describe("Bob never sends an initial NOTIFY request", () => {
          beforeEach(async () => {
            resetSpies();
          });

          it("the subscriber should send nothing", () => {
            const spy = alice.transportSendSpy;
            expect(spy).not.toHaveBeenCalled();
          });

          it("the subscription delegate should not be called", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(0);
          });

          it("the subscription state should transition to 'terminated' after timeout waiting for NOTIFY", async () => {
            await soon(Timers.TIMER_N + 1);
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
          });
        });

        describe("Bob sends an initial NOTIFY with incorrect Event header", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Event: not${receivedEvent}`);
            extraHeaders.push(`Subscription-State: terminated`);
            extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await alice.transport.waitReceived();
          });

          it("the subscriber should send a 481 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_481);
          });

          it("the subscription delegate should not be called", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(0);
          });

          it("the subscription state should not change", () => {
            expect(subscriptionStateSpy).not.toHaveBeenCalled();
          });

          it("the subscription state should transition to 'terminated' after timeout waiting for NOTIFY", async () => {
            await soon(Timers.TIMER_N + 1);
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
          });
        });

        describe("Bob sends an initial NOTIFY with missing Event header", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Subscription-State: terminated`);
            extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await alice.transport.waitReceived();
          });

          it("the subscriber should send a 489 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_489);
          });

          it("the subscription delegate should not be called", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(0);
          });

          it("the subscription state should not change", () => {
            expect(subscriptionStateSpy).not.toHaveBeenCalled();
          });

          it("the subscription state should transition to 'terminated' after timeout waiting for NOTIFY", async () => {
            await soon(Timers.TIMER_N + 1);
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
          });
        });

        describe("Bob sends an initial NOTIFY with missing Subscription-State header", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Event: ${receivedEvent}`);
            extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await alice.transport.waitReceived();
          });

          it("the subscriber should send a 489 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_489);
          });

          it("the subscription delegate should not be called", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(0);
          });

          it("the subscription state should not change", () => {
            expect(subscriptionStateSpy).not.toHaveBeenCalled();
          });

          it("the subscription state should transition to 'terminated' after timeout waiting for NOTIFY", async () => {
            await soon(Timers.TIMER_N + 1);
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
          });
        });

        describe("Bob sends an initial NOTIFY with subscription state 'terminated'", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Event: ${receivedEvent}`);
            extraHeaders.push(`Subscription-State: terminated`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await alice.transport.waitReceived();
          });

          it("the subscriber should send a 200 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_200);
          });

          it("the subscription delegate should onNotify()", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(1);
          });

          it("the subscription state should transition to 'subscribed', 'terminated'", () => {
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Subscribed]);
            expect(spy.calls.argsFor(1)).toEqual([SubscriptionState.Terminated]);
          });
        });

        describe("Bob sends an initial NOTIFY with subscription state 'pending'", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Event: ${receivedEvent}`);
            extraHeaders.push(`Subscription-State: pending;expires=${receivedExpires}`);
            extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await bob.transport.waitReceived();
          });

          it("the subscriber should send a 200 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_200);
          });

          it("the subscription delegate should onNotify()", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(1);
          });

          it("the subscription state should transition to 'subscribed'", () => {
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Subscribed]);
          });

          describe("Alice re-subscribes", () => {
            beforeEach(async () => {
              resetSpies();
              subscriber.subscribe();
              await soon();
            });

            it("the subscriber should send nothing", () => {
              expect(alice.transportSendSpy).not.toHaveBeenCalled();
            });

            it("the subscription delegate should not be called", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(0);
            });

            it("the subscription state should not change", () => {
              expect(subscriptionStateSpy).not.toHaveBeenCalled();
            });
          });
        });

        describe("Bob sends an initial NOTIFY with subscription state 'active'", () => {
          beforeEach(async () => {
            resetSpies();
            const extraHeaders = new Array<string>();
            extraHeaders.push(`Event: ${receivedEvent}`);
            extraHeaders.push(`Subscription-State: active;expires=${receivedExpires}`);
            extraHeaders.push(`Contact: ${bob.userAgent.contact.uri.toString()}`);
            const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
            const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
            await bob.transport.waitReceived();
          });

          it("the subscriber should send a 200 to the NOTIFY", () => {
            const spy = alice.transportSendSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual(SIP_200);
          });

          it("the subscription delegate should onNotify()", () => {
            const spy = subscriptionDelegateMock;
            expect(spy.onNotify).toHaveBeenCalledTimes(1);
          });

          it("the subscription state should transition to 'subscribed'", () => {
            const spy = subscriptionStateSpy;
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Subscribed]);
          });

          describe("Alice re-subscribes", () => {
            beforeEach(async () => {
              resetSpies();
              subscriber.subscribe();
              await alice.transport.waitReceived();
            });

            it("the subscriber should send an SUBSCRIBE", () => {
              const spy = alice.transportSendSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual(SIP_SUBSCRIBE);
            });

            it("the subscription delegate should not be called", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(0);
            });

            it("the subscription state should not change", () => {
              expect(subscriptionStateSpy).not.toHaveBeenCalled();
            });
          });

          describe("Alice unsubscribes", () => {
            beforeEach(async () => {
              resetSpies();
              subscription.unsubscribe();
              await alice.transport.waitReceived();
            });

            it("the subscriber should send an un-SUBSCRIBE", () => {
              const spy = alice.transportSendSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual(SIP_SUBSCRIBE);
            });

            it("the subscription delegate should not be called", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(0);
            });

            it("the subscription state should transition to 'terminated'", () => {
              const spy = subscriptionStateSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
            });
          });

          describe("Bob terminates with no reason code", () => {
            beforeEach(async () => {
              resetSpies();
              const extraHeaders = new Array<string>();
              extraHeaders.push(`Event: ${receivedEvent}`);
              extraHeaders.push(`Subscription-State: terminated`);
              const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
              const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
              await bob.transport.waitReceived();
            });

            it("the subscriber should send a 200 to the NOTIFY", () => {
              const spy = alice.transportSendSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual(SIP_200);
            });

            it("the subscription delegate should onNotify()", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(1);
            });

            it("the subscription state should transition to 'terminated'", () => {
              const spy = subscriptionStateSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual([SubscriptionState.Terminated]);
            });
          });

          describe("Bob terminates with timeout reason code", () => {
            beforeEach(async () => {
              resetSpies();
              const extraHeaders = new Array<string>();
              extraHeaders.push(`Event: ${receivedEvent}`);
              extraHeaders.push(`Subscription-State: terminated;reason=timeout`);
              const message = notifierDialog.createOutgoingRequestMessage(C.NOTIFY, { extraHeaders });
              const uac = new UserAgentClient(NonInviteClientTransaction, notifierDialog.userAgentCore, message);
              await bob.transport.waitReceived();
            });

            it("the subscriber should send a 200 to the NOTIFY and then a SUBSCRIBE", () => {
              const spy = alice.transportSendSpy;
              expect(spy).toHaveBeenCalledTimes(2);
              expect(spy.calls.argsFor(0)).toEqual(SIP_200);
              expect(spy.calls.argsFor(1)).toEqual(SIP_SUBSCRIBE);
            });

            it("the subscription delegate should onNotify()", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(1);
            });

            it("the subscription state should not change", () => {
              expect(subscriptionStateSpy).not.toHaveBeenCalled();
            });
          });

          describe("Prior to subscription expiration, ", () => {
            beforeEach(async () => {
              resetSpies();
              await soon(3600 * 900);
            });

            it("the subscriber should send a re-SUBSCRIBE", () => {
              const spy = alice.transportSendSpy;
              expect(spy).toHaveBeenCalledTimes(1);
              expect(spy.calls.argsFor(0)).toEqual(SIP_SUBSCRIBE);
            });

            it("the subscription delegate should not be called", () => {
              const spy = subscriptionDelegateMock;
              expect(spy.onNotify).toHaveBeenCalledTimes(0);
            });

            it("the subscription state should not change", () => {
              expect(subscriptionStateSpy).not.toHaveBeenCalled();
            });
          });
        });
      });
    });
  });
});
