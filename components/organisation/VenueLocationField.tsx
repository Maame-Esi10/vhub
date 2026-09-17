import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { getPositionOrNull } from '@/lib/geolocation';
import { useVenuePhotoUpload } from '@/hooks/useMediaUpload';
import { humanErrorOrNull } from '@/lib/errorMessage';

export interface VenueLocation {
  /**
   * Cloudinary delivery URL of the venue photo, exactly as stored.
   *
   * The URL rather than the public_id, which is the convention every PUBLIC
   * image in this app follows: rendering a public_id means building a delivery
   * URL, which needs the cloud name, and the client only learns that from the
   * signature endpoint at upload time.
   */
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export interface VenueLocationFieldProps {
  value: VenueLocation;
  onChange: (next: VenueLocation) => void;
}

/**
 * A photo of the venue, and its coordinates.
 *
 * WHY BOTH, AND WHY NEITHER IS REQUIRED (owner-approved 2026-09-16).
 *
 * "Korle Bu Teaching Hospital" is a name, not a place you can find. A volunteer
 * travelling somewhere they have never been has a district, a venue name and
 * nothing else -- no picture of what they are looking for when they arrive, and
 * no way to hand the address to a map.
 *
 * Both stay OPTIONAL and the copy says so. An organisation filling this in from
 * an office across the country cannot capture coordinates, and one without a
 * photo of the site should not be blocked from publishing. A required field
 * here would be answered with a guess, and a guessed coordinate is worse than
 * none: it sends people to the wrong place with confidence.
 *
 * NO EMBEDDED MAP, deliberately. `react-native-maps` is a new dependency AND a
 * native rebuild, and it defaults to Google Maps on Android. `expo-location` is
 * already here, so this captures a point in one tap and the volunteer opens it
 * in whichever map app their phone already has -- which handles walking
 * directions, offline tiles and everything else far better than a map rendered
 * inside VHub ever would.
 *
 * THE COORDINATES ARE THE DEVICE'S, NOT THE VENUE NAME GEOCODED. There is no
 * lookup and no guessing: the button means "I am standing here", which is the
 * only claim this can make honestly.
 */
export function VenueLocationField({ value, onChange }: VenueLocationFieldProps) {
  const upload = useVenuePhotoUpload();
  const [locating, setLocating] = useState(false);
  const [locationRefused, setLocationRefused] = useState(false);

  function handlePickPhoto() {
    upload.mutate(undefined, {
      onSuccess: (result) => {
        // null means the picker was dismissed, which is not a failure.
        if (!result) return;
        onChange({ ...value, imageUrl: result.secureUrl });
      },
    });
  }

  async function handleCapturePosition() {
    setLocating(true);
    setLocationRefused(false);
    try {
      // getPositionOrNull, not requirePosition: a refusal here is an ordinary
      // answer to an optional field, not an error the form has to recover from.
      const position = await getPositionOrNull();
      if (!position) {
        setLocationRefused(true);
        return;
      }
      onChange({ ...value, lat: position.latitude, lng: position.longitude });
    } finally {
      setLocating(false);
    }
  }

  const hasPosition = value.lat !== null && value.lng !== null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Helping volunteers find it</Text>
      <Text style={styles.lead}>
        Both are optional. A photo and a pin make a venue name much easier to arrive at.
      </Text>

      {value.imageUrl ? (
        <View style={styles.preview}>
          <Image source={{ uri: value.imageUrl }} style={styles.previewImage} resizeMode="cover" />
          <Pressable
            onPress={() => onChange({ ...value, imageUrl: null })}
            accessibilityRole="button"
            accessibilityLabel="Remove the venue photo"
            hitSlop={8}
            style={styles.removeButton}
          >
            <MaterialCommunityIcons name="close" size={16} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={handlePickPhoto}
        disabled={upload.isPending}
        accessibilityRole="button"
        accessibilityLabel="Add a photo of the venue"
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {upload.isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name="image-plus" size={18} color={colors.primary} />
        )}
        <Text style={styles.actionText}>
          {value.imageUrl ? 'Replace the photo' : 'Add a photo of the venue'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => void handleCapturePosition()}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel="Use my current location as the venue pin"
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {locating ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons
            name={hasPosition ? 'map-marker-check' : 'map-marker-plus'}
            size={18}
            color={colors.primary}
          />
        )}
        <Text style={styles.actionText}>
          {hasPosition ? 'Pin saved. Set it again' : 'Use my current location'}
        </Text>
      </Pressable>

      {hasPosition ? (
        <View style={styles.pinRow}>
          <Text style={styles.pinText}>
            {/* Five decimal places is about a metre. More would imply a precision
                a phone does not have. */}
            {value.lat?.toFixed(5)}, {value.lng?.toFixed(5)}
          </Text>
          <Pressable
            onPress={() => onChange({ ...value, lat: null, lng: null })}
            accessibilityRole="button"
            accessibilityLabel="Remove the venue pin"
            hitSlop={8}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {locationRefused ? (
        <Text style={styles.hint}>
          No location available. Check the permission, or leave it out and the venue name will do.
        </Text>
      ) : null}

      {upload.isError ? (
        <Text style={styles.hint}>
          {humanErrorOrNull(upload.error, 'Could not add that photo. Please try again.')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  lead: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  preview: {
    height: 150,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 23, 43, 0.6)',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.md,
  },
  pinText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  clearText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
