import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
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
 * Positioned at the BOTTOM, clear of the header, and above the tab bar so it
 * never covers a control the organisation might be reaching for.
 */
export function Toast({ message, tone = 'success', onDismiss, durationMs = 3200 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!message) return;

    opacity.setValue(0);
    lift.setValue(16);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 16, duration: 220, useNativeDriver: true }),
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
        { opacity, transform: [{ translateY: lift }] },
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
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
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
