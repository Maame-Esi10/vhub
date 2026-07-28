import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

export interface ListSkeletonProps {
  /** Number of placeholder rows to render. */
  rows?: number;
  /** Height of each placeholder row/card. */
  rowHeight?: number;
}

/** Pulsing placeholder rows shown while a list query is loading. */
export function ListSkeleton({ rows = 3, rowHeight = 96 }: ListSkeletonProps) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.container} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }).map((_, index) => (
        <Animated.View
          key={index}
          style={[styles.row, { height: rowHeight, opacity: pulse }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.base,
  },
});
