import type { KeyboardAvoidingViewProps } from 'react-native';

/**
 * How every `KeyboardAvoidingView` in the app behaves.
 *
 * IT USED TO BE `Platform.OS === 'ios' ? 'padding' : undefined`, at ten
 * separate sites, and on Android that means the component does nothing at all.
 *
 * That was correct advice once. Android's own `adjustResize` used to shrink
 * the window when the keyboard opened, so a ScrollView inside it shrank too
 * and the focused field stayed reachable — React Native's docs still say you
 * usually need no help on Android for exactly that reason.
 *
 * It stopped being true when the app went edge-to-edge, which Expo SDK 57 and
 * React Native 0.86 do by default and Android 15 enforces. An edge-to-edge
 * window draws behind the system bars, so it does NOT resize when the keyboard
 * appears — the keyboard is simply an inset over the top of it. Nothing
 * shrinks, nothing scrolls, and the field the user is typing into is behind
 * the keyboard. That is the "I cannot see what I am typing" report on the
 * registration screen, and it applies to every form in the app.
 *
 * `padding` works on both platforms because React Native derives it from the
 * keyboard events, which still fire in edge-to-edge. Written here once so the
 * reasoning lives in one place rather than in ten copies of a ternary that
 * would each have to be found again.
 */
export const KEYBOARD_AVOID_BEHAVIOR: KeyboardAvoidingViewProps['behavior'] = 'padding';
