import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

export interface ChecklistSection {
  title: string;
  /** MaterialCommunityIcons glyph for the tab. Falls back to a generic tag. */
  icon?: string;
  data: string[];
}

export interface CategoryChecklistProps {
  sections: readonly ChecklistSection[];
  selected: ReadonlySet<string>;
  onToggle: (item: string) => void;
  /**
   * True while a search is running. Tabs are bypassed entirely and every
   * match is shown under its own heading, because hiding matches behind a tab
   * is the wrong answer to "show me where this is".
   */
  searching?: boolean;
}

/**
 * A long checklist as oval category tabs with chips underneath.
 *
 * WHY THE COLLAPSIBLE CARDS ARE GONE (owner, 2026-09-21, having asked for this
 * more than once: "I am still seeing blocks with arrows. It should be the oval
 * tabs at the top, not inside the block").
 *
 * The previous shape was ten full-width cards, each with a 40dp icon, a title,
 * a count and a chevron, and the chips hidden inside until you opened one. It
 * had three problems and only the first is cosmetic.
 *
 * Ten closed cards are a table of contents, not a picker. Before you can
 * choose anything you have to make a second, earlier choice about which drawer
 * to open, and nothing on a closed card tells you whether the skill you want
 * is in it. Worse, the cards were tall enough that the actual skills were
 * usually off-screen once one was open, so choosing across two categories --
 * which is what people genuinely do -- meant scrolling past nine headings to
 * get between them.
 *
 * Tabs cost one row for all ten categories and keep the chips at a fixed place
 * on the screen, so switching category changes only the chips and never the
 * scroll position. Each tab carries its count, which is the one thing the
 * cards did well: nobody should have to open a drawer to find out what they
 * already picked.
 *
 * THIS IS NOT THE ONBOARDING PICKER, and the distinction matters when editing
 * either. Onboarding has its own `components/onboarding/SkillPicker`, split off
 * on 2026-09-11 on the owner's instruction, because the two flows genuinely
 * differ: the organisation's is search-first, opened from a form field by
 * somebody who knows what they are looking for, and the volunteer's is
 * browse-first, because it is asking what they can do. That split stands.
 *
 * What was never deliberate was them LOOKING different. SkillPicker had
 * already been rebuilt into a rail of categories with chips underneath and
 * this one was left as accordion cards, which is the drift the owner kept
 * reporting. The tab styles below are therefore COPIED from SkillPicker's rail
 * rather than chosen again; see the note on them.
 *
 * They are still two files, so a change to one must be made to the other by
 * hand. Merging them would mean re-merging the two behaviours that were
 * deliberately separated, which is a worse trade than keeping the styles in
 * step.
 */
export function CategoryChecklist({
  sections,
  selected,
  onToggle,
  searching = false,
}: CategoryChecklistProps) {
  /*
    The active tab is held by TITLE, not by index.

    While a search is running the visible sections are filtered by the caller,
    so an index would silently point at a different category as the user typed.
    A title that is no longer present falls back to the first section, which
    is the behaviour the `activeTitle` resolution below gives for free.
  */
  const [active, setActive] = useState<string | null>(null);

  const activeSection = useMemo(() => {
    if (sections.length === 0) return null;
    return sections.find((section) => section.title === active) ?? sections[0]!;
  }, [sections, active]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of sections) {
      map.set(section.title, section.data.filter((item) => selected.has(item)).length);
    }
    return map;
  }, [sections, selected]);

  function renderChips(items: readonly string[]) {
    return (
      <View style={styles.grid}>
        {items.map((item) => {
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
              <Text style={[styles.skillChipText, isSelected && styles.skillChipTextSelected]}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  /*
    SEARCH BYPASSES THE TABS COMPLETELY. A query that matches three categories
    must show all three: putting two of them behind a tab the user cannot see
    is exactly the failure the collapsible cards had, moved sideways.
  */
  if (searching) {
    return (
      <View>
        {sections.map((section) => (
          <View key={section.title} style={styles.searchGroup}>
            <Text style={styles.searchHeading}>{section.title}</Text>
            {renderChips(section.data)}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {sections.map((section) => {
          const isActive = section.title === activeSection?.title;
          const chosen = counts.get(section.title) ?? 0;

          return (
            <Pressable
              key={section.title}
              onPress={() => setActive(section.title)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${section.title}, ${chosen} selected`}
              style={({ pressed }) => [
                styles.tab,
                isActive && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name={(section.icon ?? 'tag-outline') as keyof typeof MaterialCommunityIcons.glyphMap}
                size={16}
                color={isActive ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{section.title}</Text>
              {/*
                The count is the one thing the old cards did well: without it
                you would have to visit every tab to find out what you already
                picked.
              */}
              {chosen > 0 ? (
                <View style={[styles.countPill, isActive && styles.countPillActive]}>
                  <Text style={[styles.countText, isActive && styles.countTextActive]}>
                    {chosen}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {activeSection ? renderChips(activeSection.data) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    MATCHED TO components/onboarding/SkillPicker's rail, TO THE TOKEN (owner,
    2026-09-21: "the organisation skills UI must match the onboarding design").

    Onboarding already had exactly this shape and this is the screen that had
    drifted, so these values are copied from there rather than chosen again:
    a `surface` fill with no border, navy when active, a 13px medium label, a
    16px glyph in textSecondary, and the count in a pill that inverts on the
    active tab. Picking "close enough" values here is how two screens that are
    meant to be identical stop being identical, which is the fault being fixed.
  */
  tabs: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.base,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  tabActive: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  countPill: {
    minWidth: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  countPillActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  countText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  countTextActive: {
    color: colors.white,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.base,
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
    /*
      THE OVALS ARE NO LONGER TALLER THAN THEY NEED TO BE.

      `paddingVertical: spacing.md` (12) on a 14px line gave a 42dp pill, and a
      chip whose label wrapped to two lines became 60dp -- which is what makes
      some ovals look over-padded next to their neighbours while the short ones
      look right. `minHeight` holds the 44dp tap target instead, so every chip
      is the same height whatever its label does, and the padding no longer
      multiplies with the number of lines.
    */
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  skillChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 107, 107, 0.10)',
  },
  chipPressed: {
    opacity: 0.7,
  },
  skillChipText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  skillChipTextSelected: {
    color: colors.primary,
  },
  searchGroup: {
    marginBottom: spacing.base,
  },
  searchHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
});
