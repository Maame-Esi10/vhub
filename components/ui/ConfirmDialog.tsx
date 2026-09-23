import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import type { ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { KEYBOARD_AVOID_BEHAVIOR } from '@/constants/keyboard';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type ConfirmDialogTone = 'default' | 'destructive';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Glyph shown in the tinted circle above the title. */
  icon?: IconName;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' tints the icon and confirm button danger-red. */
  tone?: ConfirmDialogTone;
  /** Shows a spinner in the confirm button and blocks both actions. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Extra content between the message and the buttons — a required reason
   * field, most often.
   *
   * Added for moderation, where the confirmation and the reason are one act:
   * splitting them across two screens would let an admin suspend somebody and
   * then be asked, afterwards, why they had. The dialog stays a confirmation;
   * this is the part of the confirmation the admin has to write.
   */
  children?: ReactNode;
}

/**
 * VHub's in-app replacement for Alert.alert.
 *
 * The native alert renders as an Android/iOS system popup — square corners,
 * platform fonts, platform blue — which reads as "not part of this app"
 * against VHub's rounded, coral/navy Inter styling. This is a plain RN
 * Modal styled from constants/theme so confirmations look like the rest of
 * the app on both platforms. Use it anywhere Alert.alert would otherwise
 * be reached for; nothing in the app should surface a system dialog.
 *
 * Dismissal: tapping the scrim or the hardware back button both cancel,
 * matching the native alert's behaviour for a cancelable confirm. While
 * `busy` is set, both are ignored so an in-flight action can't be
 * interrupted halfway.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const destructive = tone === 'destructive';
  const accent = destructive ? colors.danger : colors.primary;

  function handleDismiss() {
    if (!busy) {
      onCancel();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      {/*
        THE KEYBOARD IS HANDLED HERE, ONCE, RATHER THAN AT FIVE CALL SITES.
        `children` exists to hold a required reason field, and four of the five
        callers make it required: the suspend/ban reason, the V-Score reversal
        reason, the vetted-source removal reason and the dispute statement. The
        Confirm button sits BELOW that field in the card.

        The app is edge-to-edge, so the Android window does not resize when the
        keyboard opens: a centred card whose lower half is a multiline field
        plus a Confirm button simply had that half covered. The screens behind
        this do have their own KeyboardAvoidingView, but a Modal is not inside
        their view tree, so none of that protection ever reached the dialog.
      */}
      <KeyboardAvoidingView behavior={KEYBOARD_AVOID_BEHAVIOR} style={styles.avoider}>
      <Pressable style={styles.scrim} onPress={handleDismiss} accessibilityLabel="Dismiss dialog">
        {/*
          The card is a Pressable with a no-op onPress purely to swallow taps
          so they don't bubble to the scrim and dismiss the dialog.
        */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
          {icon ? (
            <View style={[styles.iconCircle, { backgroundColor: tintOf(accent) }]}>
              <MaterialCommunityIcons name={icon} size={26} color={accent} />
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children ? <View style={styles.extra}>{children}</View> : null}

          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [
              styles.confirm,
              { backgroundColor: destructive ? colors.danger : colors.navy },
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed, busy && styles.disabled]}
          >
            <Text style={styles.cancelLabel}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 12%-alpha wash of an accent, matching the badge fills used app-wide. */
function tintOf(accent: string) {
  return accent === colors.danger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 107, 107, 0.12)';
}

const styles = StyleSheet.create({
  avoider: { flex: 1 },
  extra: { width: '100%', marginBottom: spacing.base },
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.base,
    alignItems: 'center',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  confirm: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  confirmLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  cancel: {
    alignSelf: 'stretch',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  cancelLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
