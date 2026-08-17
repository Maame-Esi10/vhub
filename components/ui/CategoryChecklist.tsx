import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface ChecklistSection {
  title: string;
  /** MaterialCommunityIcons glyph for the card. Falls back to a generic tag. */
  icon?: string;
  data: string[];
}

export interface CategoryChecklistProps {
  sections: readonly ChecklistSection[];
  selected: ReadonlySet<string>;
  onToggle: (item: string) => void;
  /**
   * True while a search is running. Every card with a match opens itself, since
   * collapsing is the wrong answer to "show me where this is".
   */
  searching?: boolean;
}

/**
 * A long checklist as collapsible category cards.
 *
 * WHY THIS SHAPE. The skills vocabulary is seventy-five entries across nine
 * categories, and as one flat list it was a wall: the first thing you saw was
 * every skill at once, with small grey headings that did nothing to break it
 * up. Nine cards means the first thing you see is nine choices, and an icon is
 * recognised faster than a heading is read.
 *
 * Each card carries its own count, so nobody has to open all nine to find out
 * what they already picked, and several can be open at once because people
 * choose across categories rather than finishing one before starting another.
 *
 * Shared by the picker modal and the onboarding screen deliberately. They had
 * two copies of the same list before, which is how two screens that should look
 * identical stop looking identical.
 */
export function CategoryChecklist({
  sections,
  selected,
  onToggle,
  searching = false,
}: CategoryChecklistProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Open the categories the user already has something in, so their own
  // choices are visible straight away. A single-section list opens outright:
  // a card you must tap to reveal the only content there is would be a step
  // for nothing.
  useEffect(() => {
    if (sections.length === 1) {
      setExpanded(new Set(sections.map((section) => section.title)));
      return;
    }
    setExpanded(
      new Set(
        sections
          .filter((section) => section.data.some((item) => selected.has(item)))
          .map((section) => section.title)
      )
    );
    // Mount only. Re-running as selections change would reopen a category the
    // user had just collapsed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSection(title: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <View>
      {sections.map((section) => {
        const chosen = section.data.filter((item) => selected.has(item)).length;
        const isOpen = searching || expanded.has(section.title);

        return (
          <View key={section.title} style={styles.card}>
            <Pressable
              onPress={() => toggleSection(section.title)}
              accessibilityRole="button"
              accessibilityLabel={`${section.title}, ${chosen} of ${section.data.length} selected`}
              accessibilityState={{ expanded: isOpen }}
              style={({ pressed }) => [
                styles.header,
                chosen > 0 && styles.headerChosen,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.icon, chosen > 0 && styles.iconChosen]}>
                <MaterialCommunityIcons
                  name={
                    (section.icon ?? 'tag-outline') as keyof typeof MaterialCommunityIcons.glyphMap
                  }
                  size={20}
                  color={chosen > 0 ? colors.white : colors.primary}
                />
              </View>

              <View style={styles.text}>
                <Text style={styles.title}>{section.title}</Text>
                <Text style={styles.meta}>
                  {chosen > 0
                    ? `${chosen} of ${section.data.length} selected`
                    : `${section.data.length} skills`}
                </Text>
              </View>

              <MaterialCommunityIcons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={colors.textSecondary}
              />
            </Pressable>

            {isOpen ? (
              <View style={styles.body}>
                {section.data.map((item) => (
                  <View key={item} style={styles.row}>
                    <Text style={styles.rowLabel}>{item}</Text>
                    <Switch
                      value={selected.has(item)}
                      onValueChange={() => onToggle(item)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.white}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.base,
  },
  headerChosen: {
    backgroundColor: colors.surfaceSubtle,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  iconChosen: {
    backgroundColor: colors.primary,
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingVertical: spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.85,
  },
});
