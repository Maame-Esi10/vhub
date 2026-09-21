import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type AlertTone = 'success' | 'error' | 'info';

export interface AlertDialogProps {
  visible: boolean;
  title: string;
  message?: string | null;
  tone?: AlertTone;
  /** Overrides the tone's default glyph. */
  icon?: IconName;
  /** The single acknowledging button. */
  dismissLabel?: string;
  onDismiss: () => void;
  /**
   * An optional second button that DOES something, shown above the dismiss.
   *
   * This is what lets a confirmation offer the obvious next step without
   * taking it on the person's behalf. Saving a draft used to navigate
   * straight into Manage Event; now the popup says where the draft went and
   * this button offers to go there.
   */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * The informational half of VHub's popup system.
 *
 * ConfirmDialog asks a question with two answers. This one STATES SOMETHING
 * and has nothing to ask: an action was refused, a request failed, a thing was
 * created or saved. Both render as a card over a dimmed scrim so they read as
 * the same mechanism.
 *
 * WHY IT EXISTS (owner, repeatedly, most recently 2026-09-21). Refusals and
 * confirmations were being rendered INTO the page as a line of text under the
 * submit button. On a scrolling wizard that line is frequently off-screen at
 * the moment it is written, so a refused publish looked identical to a button
 * that did nothing at all: the database trigger said "this organisation is not
 * verified, so it cannot publish outreaches yet", and the organisation never
 * saw it. A message that explains a refusal is worthless if it appears
 * somewhere the person is not looking, and "nothing happened" is the single
 * worst thing an app can say.
 *
 * TOASTS ARE NOT THE ANSWER EITHER, and the distinction matters. A toast is a
 * receipt for something that plainly worked and that the person can already
 * see the result of; it takes itself away and requires nothing. A refusal, a
 * failure, and a creation whose result is NOT on screen all need an
 * acknowledgement, because the whole point is that the person has to read
 * something before carrying on.
 */
const TONE: Record<AlertTone, { accent: string; tint: string; icon: IconName }> = {
  success: { accent: colors.success, tint: 'rgba(34, 197, 94, 0.12)', icon: 'check-circle-outline' },
  error: { accent: colors.danger, tint: 'rgba(239, 68, 68, 0.12)', icon: 'alert-circle-outline' },
  info: { accent: colors.primary, tint: 'rgba(255, 107, 107, 0.12)', icon: 'information-outline' },
};

export function AlertDialog({
  visible,
  title,
  message,
  tone = 'info',
  icon,
  dismissLabel = 'Got it',
  onDismiss,
  actionLabel,
  onAction,
}: AlertDialogProps) {
  const { accent, tint, icon: defaultIcon } = TONE[tone];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss">
        {/*
          A Pressable with a no-op onPress purely to swallow taps so they do
          not bubble to the scrim and dismiss the dialog.
        */}
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
          <View style={[styles.iconCircle, { backgroundColor: tint }]}>
            <MaterialCommunityIcons name={icon ?? defaultIcon} size={26} color={accent} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {actionLabel && onAction ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={styles.actionLabel}>{actionLabel}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            style={({ pressed }) => [
              actionLabel && onAction ? styles.dismissSecondary : styles.dismissPrimary,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={actionLabel && onAction ? styles.dismissSecondaryLabel : styles.dismissPrimaryLabel}
            >
              {dismissLabel}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  action: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  actionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  /** With no secondary action this is the only button, so it is the solid one. */
  dismissPrimary: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  dismissPrimaryLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  dismissSecondary: {
    alignSelf: 'stretch',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  dismissSecondaryLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
