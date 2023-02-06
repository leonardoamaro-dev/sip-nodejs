const T1: number = 500;
const T2: number = 4000;
const T4: number = 5000;

/**
 * Timers.
 * @public
 */
export const Timers = {
  T1,
  T2,
  T4,
  TIMER_B: 64 * T1,
  TIMER_D: 0  * T1, // Not correct for unreliable transports
  TIMER_F: 64 * T1,
  TIMER_H: 64 * T1,
  TIMER_I: 0  * T4, // Not correct for unreliable transports
  TIMER_J: 0  * T1, // Not correct for unreliable transports
  TIMER_K: 0  * T4, // Not correct for unreliable transports
  TIMER_L: 64 * T1,
  TIMER_M: 64 * T1,
  TIMER_N: 64 * T1,
  PROVISIONAL_RESPONSE_INTERVAL: 60000  // See RFC 3261 Section 13.3.1.1
};
