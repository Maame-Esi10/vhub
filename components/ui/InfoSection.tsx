import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// Collapsing a section without this is an instant jump on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface InfoSectionProps {
  icon: IconName;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible explainer card shared by the volunteer and organisation Info
 * Hubs. Extracted from the volunteer hub so the two screens cannot drift
 * apart visually — the organisation hub is explicitly meant to be the same
 * screen told from the other side of the match.
 */
export function InfoSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: InfoSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>

      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}


/**
 * The Info Hub as a rail of topics with one of them open.
 *
 * WHY THE ACCORDION WENT (owner, 2026-09-21: "the Info Hub redesign is not
 * better. It still does not look clean").
 *
 * Both hubs were five collapsed InfoSection cards. Closed, that is five
 * near-identical rounded boxes with an icon, a title, a subtitle and a
 * chevron, stacked -- so the screen a volunteer opens to have something
 * explained opens showing five boxes and no explanation. Nothing is legible
 * except the furniture, which is precisely the "not clean" being reported, and
 * it is the same fault as the skills picker's blocks with arrows: a table of
 * contents presented as though it were the content.
 *
 * It is also self-defeating for this screen in particular. An accordion is a
 * reasonable way to skim a reference you already understand; the Info Hub
 * exists for people who do not, and asking them which of five drawers holds
 * the answer is asking the question they came to have answered.
 *
 * So: one horizontal rail, one topic open beneath it, always. The screen now
 * opens with real prose on it. Switching topic changes only the body, so the
 * rail stays put and comparing two topics is two taps rather than two scrolls.
 * The rail is styled from SkillPicker's, like the skills tabs, so the third
 * place in the app that says "pick one of these and read it" looks like the
 * other two.
 *
 * IT READS ITS CHILDREN'S PROPS. Each child is an <InfoSection>, and this
 * takes that element's icon, title and subtitle for the rail and renders its
 * children as the body. That keeps both hub screens exactly as they were
 * written -- a list of sections with JSX inside -- rather than forcing their
 * bodies into an array of render functions, which is a large mechanical change
 * to two long files for no gain the reader can see. InfoSection still renders
 * on its own as a collapsible card when used outside this wrapper.
 */
export function InfoTopics({ children }: { children: ReactNode }) {
  const topics = Children.toArray(children).filter(isValidElement) as ReactElement<InfoSectionProps>[];
  const [active, setActive] = useState(0);

  if (topics.length === 0) return null;

  // Clamped rather than trusted: a hub that conditionally renders a section
  // can shrink between renders, and an index past the end would blank the
  // body with no way back to it.
  const index = Math.min(active, topics.length - 1);
  const current = topics[index]!;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {topics.map((topic, topicIndex) => {
          const isActive = topicIndex === index;
          return (
            <Pressable
              key={topic.props.title}
              onPress={() => setActive(topicIndex)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={topic.props.title}
              style={({ pressed }) => [
                styles.railChip,
                isActive && styles.railChipActive,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={topic.props.icon}
                size={16}
                color={isActive ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.railChipText, isActive && styles.railChipTextActive]}>
                {topic.props.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.topicCard}>
        <Text style={styles.topicTitle}>{current.props.title}</Text>
        <Text style={styles.topicSubtitle}>{current.props.subtitle}</Text>
        <View style={styles.topicBody}>{current.props.children}</View>
      </View>
    </View>
  );
}

/** Body paragraph inside an InfoSection. */
export function InfoBody({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

/** Bold lead-in above a group of rows. */
export function InfoSubheading({ children }: { children: ReactNode }) {
  return <Text style={styles.subheading}>{children}</Text>;
}

/**
 * Numbered pill + label + explanation. `tone="penalty"` switches the pill
 * from coral to red for negative values.
 */
export function InfoWeightRow({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'penalty';
}) {
  const penalty = tone === 'penalty';
  return (
    <View style={styles.weightRow}>
      <View style={[styles.weightPill, penalty && styles.penaltyPill]}>
        <Text style={[styles.weightPillText, penalty && styles.penaltyPillText]}>{value}</Text>
      </View>
      <View style={styles.weightText}>
        <Text style={styles.weightLabel}>{label}</Text>
        <Text style={styles.weightDetail}>{detail}</Text>
      </View>
    </View>
  );
}

/** Left label / right value row, divided by a hairline. */
export function InfoBandRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.bandRow}>
      <Text style={styles.bandName}>{label}</Text>
      <Text style={styles.bandRange}>{value}</Text>
    </View>
  );
}

/** Tinted aside for a caveat worth pulling out of the body copy. */
export function InfoCallout({ icon = 'information-outline', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.callout}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.calloutText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Copied from components/onboarding/SkillPicker's rail, for the same reason
     the skills tabs were: three places in the app now say "pick one of these
     and read it", and they should not look like three different apps. */
  rail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.base,
  },
  railChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  railChipActive: {
    backgroundColor: colors.navy,
  },
  railChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  railChipTextActive: {
    color: colors.white,
  },
  topicCard: {
    marginTop: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  topicTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  topicSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 2,
  },
  topicBody: {
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  section: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.8,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionBody: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  subheading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  weightRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  weightPill: {
    minWidth: 36,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  weightPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
  },
  penaltyPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  penaltyPillText: {
    color: colors.danger,
  },
  weightText: {
    flex: 1,
  },
  weightLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  weightDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bandName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  bandRange: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  callout: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  calloutText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
