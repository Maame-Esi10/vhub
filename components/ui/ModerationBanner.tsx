import {
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

/**
 * Tells a suspended or banned account that it is, and why.
 *
 * WITHOUT THIS, a suspension is indistinguishable from the app being broken.
 * The database refuses the write and the screen shows an error about a
 * constraint; somebody in that position tries again, then tries something else,
 * then writes to us. The notification sent at the moment of suspension helps
 * only the person who reads it before it scrolls away.
 *
 * Renders NOTHING for an active account, which is nearly everybody nearly all
 * of the time — no placeholder, no empty shell, no layout shift.
 *
 * SIZE (owner, 2026-09-22: "reduce the acc suspend box size at the top a bit
 * too"). It sits above the whole home screen, so at 20px padding and 21px line
 * height it was pushing the outreaches the screen exists for below the fold.
 * Every one of the three lines is still here and none of them is truncated --
 * the banner is the only place a suspended person reads the admin's reason,
 * and shortening the reason would be shortening the one thing they need. What
 * came out is the spacing around the words, not the words.
 */
export function ModerationBanner() {
  const profile = useAuthStore((state) => state.profile);
  const state = profile?.moderation_state ?? 'active';

  if (state === 'active') return null;

  const banned = state === 'banned';

  return (
    <View style={styles.banner}>
      <MaterialCommunityIcons
        name={banned ? 'block-helper' : 'pause-octagon-outline'}
        size={18}
        color={colors.danger}
      />
      <View style={styles.text}>
        <Text style={styles.title}>
          {banned ? 'Your account has been closed' : 'Your account is suspended'}
        </Text>
        <Text style={styles.body}>
          {profile?.moderation_reason ??
            'Contact VHub if you think this is a mistake.'}
        </Text>
        <Text style={styles.footnote}>
          {banned
            ? 'You can still see your past events and reviews. Nothing new can be started.'
            : 'You can still see everything you have already done. Nothing new can be started until this is lifted.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.base,
  },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.danger },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});
