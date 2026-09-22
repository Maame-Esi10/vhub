import { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export type ToastTone = 'success' | 'danger';

export interface ToastProps {
  /** The message. Null or empty hides the toast. */
  message: string | null;
  tone?: ToastTone;
  /** Called once the toast has finished hiding itself. */
  onDismiss: () => void;
  /** How long it stays before fading out. */
  durationMs?: number;
}

/**
 * A short confirmation that appears over the screen and takes itself away.
 *
 * WHY THIS REPLACED AN INLINE CARD. Confirmations used to be rendered into the
 * page: a green "Your changes have been saved" panel above the event. Two
 * things were wrong with that. It occupied layout, so the whole screen shifted
 * down when it appeared and back up when it went, and it read as part of the
 * event rather than as a reply to something the organisation had just done.
 *
 * A toast floats above the content, so nothing reflows, and it disappears on
 * its own, which is what makes it feel like an answer rather than a notice.
 * Tapping dismisses it early.
 *
 * POSITIONED AT THE TOP (owner's standing rule, 2026-09-22). It used to sit at
 * the bottom, above the tab bar. That was wrong for the reason the owner gave
 * about every bottom-anchored message in the app: the bottom of a phone screen
 * is where the thumb is and where the eyes are not. Somebody who has just
 * pressed a button is looking at the button and at the thing they changed, both
 * of which are usually in the upper two thirds of the screen, so a receipt
 * printed underneath the fold arrives somewhere nobody is reading. It also sat
 * directly over the floating tab pill and the gesture bar, which is the busiest
 * strip of the screen.
 *
 * It now drops in from ABOVE, below the status bar, and still takes itself
 * away. Nothing else about it changed: it is still a receipt for something that
 * plainly worked. A refusal or a failure is NOT a toast and belongs in
 * AlertDialog, which stops the person and makes them acknowledge it.
 */
export function Toast({ message, tone = 'success', onDismiss, durationMs = 3200 }: ToastProps) {
  /*
    `useState` with a lazy initialiser, NOT `useRef(new Animated.Value(0)).current`.
    Both construct the value exactly once and keep the same instance for the life
    of the component, which is all an Animated.Value needs -- but the ref form
    reads `.current` during render, which React now refuses outright, and the
    driver mutates this value on every frame without React ever knowing.
  */
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  /*
    Negative, because the toast now enters from ABOVE the top edge and settles
    down into place. When it lived at the bottom this was +16 and it rose.
  */
  const [lift] = useState(() => new Animated.Value(-16));

  useEffect(() => {
    if (!message) return;

    opacity.setValue(0);
    lift.setValue(-16);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(lift, { toValue: -16, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, durationMs);

    return () => clearTimeout(timer);
    // onDismiss is deliberately not a dependency: a caller passing an inline
    // arrow would otherwise restart the timer on every render and the toast
    // would never leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        tone === 'danger' && styles.wrapDanger,
        // The inset is a MARGIN above the pill, never padding inside it, so the
        // card clears the status bar and the notch without growing.
        { top: insets.top + spacing.sm, opacity, transform: [{ translateY: lift }] },
      ]}
      // Announced to a screen reader the moment it appears, since a sighted
      // user gets it from the animation and nobody else would.
      accessibilityLiveRegion="polite"
      accessible
      accessibilityRole="alert"
    >
      <MaterialCommunityIcons
        name={tone === 'danger' ? 'alert-circle' : 'check-circle'}
        size={18}
        color={colors.white}
      />
      <Pressable onPress={onDismiss} style={styles.press} accessibilityLabel="Dismiss">
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    // `top` is set inline from the safe-area inset; see the component.
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    // It floats over content that scrolls under it, so it needs to win.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 20,
  },
  wrapDanger: {
    backgroundColor: colors.danger,
  },
  press: {
    flex: 1,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
  },
});
