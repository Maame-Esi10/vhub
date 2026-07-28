import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '@/constants/theme';

export interface AvatarProps {
  /** Full name used to derive initials when no photo is available. */
  name: string;
  uri?: string | null;
  size?: number;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
}

/** Profile photo when available, otherwise an initials circle. No remote placeholder services. */
export function Avatar({ name, uri, size = 44 }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dimension]}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
