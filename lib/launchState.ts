import AsyncStorage from '@react-native-async-storage/async-storage';

const RETURNING_USER_KEY = 'vhub.returningUser';

/**
 * Whether the last person to use this install was signed in.
 *
 * WHY A REMEMBERED FLAG AND NOT THE SESSION ITSELF. The splash has to decide
 * what to draw on its very first frame, and at that moment nothing knows
 * whether there is a session — reading one out of SecureStore is exactly the
 * work the splash is covering. Waiting for it would mean either a blank frame
 * or, worse, drawing the wrong splash and swapping it a moment later, which is
 * the double-splash problem this screen was built to remove.
 *
 * So the answer is remembered from last time. It is written the moment a
 * session resolves and cleared on sign-out, which makes it correct for every
 * launch except the one immediately after a session expires server-side — and
 * that case shows the fuller splash to somebody who is about to be sent to the
 * welcome screen anyway, which is the right way round to be wrong.
 *
 * Deliberately AsyncStorage, not SecureStore: it is a display hint, not a
 * credential, and putting it in the keystore would mean a slower read on the
 * one code path where speed is the entire point.
 */
export async function readReturningUser(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(RETURNING_USER_KEY)) === 'true';
  } catch {
    // A storage failure must never stop the app booting. Falling back to the
    // fuller splash is the safe direction: it is the one that explains itself.
    return false;
  }
}

/** Records whether a session exists, for the next launch's splash. */
export async function writeReturningUser(signedIn: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(RETURNING_USER_KEY, signedIn ? 'true' : 'false');
  } catch {
    // Best effort by design — the cost of losing it is one fuller splash.
  }
}
