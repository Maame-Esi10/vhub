import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- opens the sections that already hold a choice, once the sections are known
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
              /*
                CHIPS, NOT SWITCH ROWS (owner, 2026-09-16: "the same
                required-skills design from onboarding... the UI only, not the
                concept").

                The two pickers stay different where it matters -- this one is
                search-first because an organisation usually has something in
                mind, and onboarding is browse-first because a volunteer is
                being asked what they can do. That is a deliberate,
                documented split and it is untouched.

                What was NOT deliberate was them LOOKING different. A full-width
                row with a Switch reads as a settings toggle: a thing you turn
                on, one per line, however short the word. A chip is sized by its
                own text, so a category fits in a third of the vertical space
                and the selected ones are visible as a group rather than as a
                column of switch positions to read one at a time.

                Same styling as components/onboarding/SkillPicker, deliberately
                to the pixel.
              */
              <View style={styles.body}>
                <View style={styles.grid}>
                  {section.data.map((item) => {
                    const isSelected = selected.has(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => onToggle(item)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={item}
                        style={({ pressed }) => [
                          styles.skillChip,
                          isSelected && styles.skillChipSelected,
                          pressed && styles.chipPressed,
                        ]}
                      >
                        {isSelected ? (
                          <MaterialCommunityIcons name="check" size={14} color={colors.primary} />
                        ) : null}
                        <Text
                          style={[styles.skillChipText, isSelected && styles.skillChipTextSelected]}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  skillChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
  },
  chipPressed: {
    opacity: 0.7,
  },
  skillChipTextSelected: {
    color: colors.primary,
  },
  skillChipText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.85,
  },
});
