import {
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '@/constants/theme';

export interface AvatarProps {
  /** Full name used to derive initials when no photo is available. */
  name: string;
  uri?: string | null;
  size?: number;
  /**
   * Draws the verified tick on the avatar's lower trailing corner.
   *
   * ONE PROP FOR BOTH ROLES (owner, 2026-09-22: "add a circle and badge or
   * badge only to the profile pic/avatar to show verified, for both the
   * verified org and volunteer"). What "verified" MEANS differs by role -- an
   * organisation's documents were checked, a volunteer's credential was -- but
   * both are the same promise to whoever is looking at the picture, and both
   * are decided by an admin and unwritable from the app. So the caller resolves
   * its own truth (`organisation_profiles.verified`, or
   * `volunteer_profiles.verification_status === 'verified'`) and this only
   * draws it. A component that went and worked the answer out for itself would
   * need to know which role it was rendering, which is exactly the branch this
   * avoids.
   *
   * It is deliberately NOT shown for `documents_pending`. A tick that means
   * "waiting" is a tick somebody will read as "checked".
   */
  verified?: boolean;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
}

/** Profile photo when available, otherwise an initials circle. No remote placeholder services. */
export function Avatar({ name, uri, size = 44, verified = false }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  const face = uri ? (
    <Image source={{ uri }} style={[styles.image, dimension]} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </View>
  );

  if (!verified) return face;

  /*
    Scaled from the avatar rather than fixed, because the same component is
    drawn at 32 on an applicant row and at 96 on a profile header. A fixed
    badge is a speck on one and a sticker on the other. The white ring is what
    keeps it legible over a photograph of any colour.
  */
  const badge = Math.max(14, Math.round(size * 0.34));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {face}
      <View
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            borderWidth: Math.max(1.5, badge * 0.12),
          },
        ]}
        // Spoken as part of the picture rather than as a separate control:
        // there is nothing to tap and nothing to do.
        accessible
        accessibilityLabel="Verified"
      >
        <MaterialCommunityIcons name="check-bold" size={badge * 0.56} color={colors.white} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  image: {
    backgroundColor: colors.surface,
  },
  fallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  badge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderColor: colors.white,
  },
});
