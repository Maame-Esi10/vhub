import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export interface SkillGroup {
  title: string;
  icon?: string;
  data: string[];
  /**
   * One line saying where this group came from, shown above its chips.
   *
   * Only the suggestion groups use it. A real category needs no explanation --
   * "Nursing Procedures" is its own justification -- but a group of skills
   * that appeared because something guessed does, and three different things
   * can do that guessing here. See the note in the skills step.
   */
  note?: string;
}

export interface SkillPickerProps {
  groups: readonly SkillGroup[];
  selected: ReadonlySet<string>;
  onToggle: (skill: string) => void;
  /** Which category rail entry is open. Ignored while a search is running. */
  activeGroup: string | null;
  onChangeGroup: (title: string) => void;
  /** Non-empty while the user is searching; the rail hides and results go flat. */
  query: string;
}

/**
 * The skills step of onboarding, and ONLY that step.
 *
 * DELIBERATELY NOT `CategoryChecklist`, which this screen used to share with
 * the outreach skill picker (owner's instruction, 2026-09-11: redesign
 * onboarding, leave the picker elsewhere alone).
 *
 * WHY IT NEEDED A DIFFERENT SHAPE. Nine collapsed accordion cards is a
 * reasonable answer to "find one skill in a long list" — which is the picker's
 * job, opened from a form field by someone who knows what they are looking
 * for. It is the wrong answer to "tell us what you can do", which is what
 * onboarding is asking. There the volunteer is being invited to browse, and
 * nine closed drawers hide the entire vocabulary behind a tap each and show
 * nothing of what the app is actually asking for.
 *
 * At a large system font it got worse rather than just longer: an accordion
 * header is a row of title, count and chevron competing for one line, so it is
 * the exact shape that squeezes, and nine of them fill the screen before a
 * single skill is visible.
 *
 * SO: one category at a time from a rail, with its skills as wrapping chips.
 * The whole vocabulary is one tap away, what you have chosen is visible at the
 * top without opening anything, and there is no row anywhere whose contents
 * have to share a line — a chip is sized by its own text, so it can grow with
 * the font and simply take another line. Searching drops the rail and shows
 * matches across every category flat, because when you have typed a word the
 * category is no longer the thing you are navigating by.
 */
export function SkillPicker({
  groups,
  selected,
  onToggle,
  activeGroup,
  onChangeGroup,
  query,
}: SkillPickerProps) {
  const searching = query.trim().length > 0;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups) {
      map.set(group.title, group.data.filter((skill) => selected.has(skill)).length);
    }
    return map;
  }, [groups, selected]);

  const activeNote = useMemo(() => {
    if (searching) return null;
    const group = groups.find((g) => g.title === activeGroup) ?? groups[0];
    return group?.note ?? null;
  }, [groups, activeGroup, searching]);

  const visible = useMemo(() => {
    if (searching) {
      /*
        DEDUPED, and this was a real crash-adjacent bug (owner, 2026-09-21:
        "Encountered two children with the same key, Community mobilisation").

        The caller PREPENDS "Recommended for you" and "Often chosen together"
        to the real categories, and a suggested skill is by definition also a
        member of its own category -- so flattening every group put the same
        string in the list twice and React saw two children with one key.

        It only happened while SEARCHING, because that is the one path that
        flattens across groups; browsing shows a single group at a time and
        could never collide. React's warning is the mild version of the
        consequence: with duplicate keys it is free to drop or duplicate a
        child, so a skill could silently fail to render or fail to toggle.

        First occurrence wins, which keeps the recommended ones at the top
        where the caller put them.
      */
      const seen = new Set<string>();
      const flat: string[] = [];
      for (const group of groups) {
        for (const skill of group.data) {
          if (seen.has(skill)) continue;
          seen.add(skill);
          flat.push(skill);
        }
      }
      return flat;
    }
    const group = groups.find((g) => g.title === activeGroup) ?? groups[0];
    return group?.data ?? [];
  }, [groups, activeGroup, searching]);

  const chosen = useMemo(() => Array.from(selected), [selected]);

  return (
    <View style={styles.container}>
      {/*
        WHAT YOU HAVE ALREADY SAID, always visible. The accordion version put
        this behind nine closed drawers: the only way to check what you had
        picked was to open every category and count. A horizontal rail keeps it
        to one line however many are chosen, and scrolls when it needs to.
      */}
      {chosen.length > 0 ? (
        <View style={styles.chosenBlock}>
          <Text style={styles.chosenLabel}>
            {chosen.length === 1 ? '1 skill selected' : `${chosen.length} skills selected`}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chosenRail}
            keyboardShouldPersistTaps="handled"
          >
            {chosen.map((skill) => (
              <Pressable
                key={skill}
                onPress={() => onToggle(skill)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${skill}`}
                style={({ pressed }) => [styles.chosenChip, pressed && styles.pressed]}
              >
                <Text style={styles.chosenChipText}>{skill}</Text>
                <MaterialCommunityIcons name="close" size={14} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {searching ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          keyboardShouldPersistTaps="handled"
        >
          {groups.map((group) => {
            const active = (activeGroup ?? groups[0]?.title) === group.title;
            const count = counts.get(group.title) ?? 0;
            return (
              <Pressable
                key={group.title}
                onPress={() => onChangeGroup(group.title)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${group.title}, ${count} selected`}
                style={({ pressed }) => [
                  styles.railChip,
                  active && styles.railChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={(group.icon as IconName) ?? 'tag-outline'}
                  size={16}
                  color={active ? colors.white : colors.textSecondary}
                />
                <Text style={[styles.railChipText, active && styles.railChipTextActive]}>
                  {group.title}
                </Text>
                {count > 0 ? (
                  <View style={[styles.railCount, active && styles.railCountActive]}>
                    <Text style={[styles.railCountText, active && styles.railCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/*
        The skills themselves. A wrapping chip grid rather than a list of rows:
        a chip is sized by its own words, so at any font size it either fits on
        the line or takes the next one. There is no column for it to be
        squeezed into and therefore nothing to break a word across.
      */}
      {activeNote ? <Text style={styles.groupNote}>{activeNote}</Text> : null}
      <View style={styles.grid}>
        {visible.map((skill) => {
          const isSelected = selected.has(skill);
          return (
            <Pressable
              key={skill}
              onPress={() => onToggle(skill)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={skill}
              style={({ pressed }) => [
                styles.skillChip,
                isSelected && styles.skillChipSelected,
                pressed && styles.pressed,
              ]}
            >
              {isSelected ? (
                <MaterialCommunityIcons name="check" size={15} color={colors.primary} />
              ) : null}
              <Text style={[styles.skillChipText, isSelected && styles.skillChipTextSelected]}>
                {skill}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  pressed: {
    opacity: 0.7,
  },

  chosenBlock: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chosenLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  chosenRail: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  chosenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chosenChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.primary,
  },

  rail: {
    gap: spacing.sm,
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
  railCount: {
    minWidth: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
  },
  railCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  railCountText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  railCountTextActive: {
    color: colors.white,
  },

  groupNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  skillChipText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textPrimary,
  },
  skillChipTextSelected: {
    fontFamily: fontFamily.medium,
    color: colors.primary,
  },
});
