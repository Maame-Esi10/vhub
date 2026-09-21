import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Input } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { useSuggestSkills } from '@/hooks/useSuggestSkills';
import { humanErrorOrNull } from '@/lib/errorMessage';

export interface SkillSuggestBoxProps {
  /**
   * Text to send when the box supplies no input of its own. Used by Create
   * Outreach, where the organisation has already written a description and
   * asking them to write it twice would be absurd.
   */
  sourceText?: string;
  /**
   * Renders its own short input.
   *
   * WITH `sourceText`, the input is SEEDED from it and stays editable (owner,
   * 2026-09-21: "add an input field for Gemini if reading the title alone is
   * not enough. Let the organisation describe the event in their own words so
   * Gemini has something to work with").
   *
   * That is the real fix for a thin result. An outreach title is often three
   * words, and "Eye Screening" is a topic rather than a description of the
   * work -- there is very little in it for a model to reason from. The title
   * and description are still the starting point, because making somebody
   * retype what they have already written would be absurd, but they are now a
   * DRAFT the organisation can add to rather than the whole of the input.
   */
  editable?: boolean;
  label: string;
  placeholder?: string;
  /** Handed the ranked skills. Always a subset of constants/skills.ts. */
  onSuggestions: (skills: string[]) => void;
}

/**
 * "Describe it, and we will point at the likely skills."
 *
 * WHY THIS EARNS ITS PLACE. The vocabulary is eighty-six skills across ten
 * categories. Search only finds words that are already in it, so an
 * organisation running a breast cancer screening day finds nothing by typing
 * "breast cancer" -- it is not a skill and never will be -- while clinical
 * breast examination, patient registration and health education all sit in the
 * list unfound. That gap is the whole reason this exists.
 *
 * IT REORDERS, IT NEVER FILTERS, AND IT NEVER TICKS ANYTHING. The caller puts
 * the result at the TOP of its picker with the full list still underneath, and
 * selection stays a deliberate tap. Filtering would let one sentence
 * permanently narrow what somebody can find, which for a volunteer means
 * narrowing their own profile -- and a profile is the thing the matcher reads.
 *
 * ONE CALL PER PRESS. It is a button, not a watcher on a text field: every
 * call spends from a daily Gemini allowance shared by every user on the
 * platform.
 *
 * WHEN IT FAILS IT SAYS SO QUIETLY AND CHANGES NOTHING. The picker underneath
 * is fully usable and was always going to be; an unavailable suggestion is not
 * an error the form has to recover from.
 */
export function SkillSuggestBox({
  sourceText,
  editable = false,
  label,
  placeholder,
  onSuggestions,
}: SkillSuggestBoxProps) {
  const suggest = useSuggestSkills();

  /*
    Seeded ONCE, then owned by the person typing.

    A `useState` initialiser rather than an effect syncing on `sourceText`:
    the outreach description keeps changing while the wizard is open, and an
    effect would overwrite whatever the organisation had added to the box
    every time they went back and edited a field. Their words have to win.
  */
  const [text, setText] = useState(() => (editable ? (sourceText ?? '') : ''));
  const [touched, setTouched] = useState(false);

  /*
    Until they touch it, the box follows the form. After that it is theirs.
    This is what makes opening the step with a description already written
    show that description in the box, without freezing it at whatever the
    description happened to be on first render.
  */
  const seeded = editable && !touched ? (sourceText ?? '') : text;
  const description = editable ? seeded : (sourceText ?? '');
  const ready = description.trim().length >= 10;
  const [empty, setEmpty] = useState(false);

  function handlePress() {
    if (!ready || suggest.isPending) return;
    setEmpty(false);
    suggest.mutate(description, {
      onSuccess: (skills) => {
        setEmpty(skills.length === 0);
        onSuggestions(skills);
      },
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>

      {editable ? (
        <Input
          placeholder={placeholder}
          value={seeded}
          onChangeText={(next) => {
            setTouched(true);
            setText(next);
          }}
          multiline
          numberOfLines={3}
          accessibilityLabel={label}
          containerStyle={styles.input}
        />
      ) : null}

      <Pressable
        onPress={handlePress}
        disabled={!ready || suggest.isPending}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || suggest.isPending }}
        accessibilityLabel="Suggest skills"
        style={({ pressed }) => [
          styles.button,
          (!ready || suggest.isPending) && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}
      >
        {suggest.isPending ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name="auto-fix" size={16} color={colors.primary} />
        )}
        <Text style={styles.buttonText}>
          {suggest.isPending ? 'Looking...' : 'Suggest skills'}
        </Text>
      </Pressable>

      {!ready ? (
        <Text style={styles.hint}>
          {editable ? 'Write a sentence first.' : 'Add a description first.'}
        </Text>
      ) : null}

      {/*
        The endpoint now always answers with something: a topical match where
        one exists, and otherwise the work every outreach needs. This only
        fires if that changes.
      */}
      {empty ? (
        <Text style={styles.hint}>No close match. The full list is below.</Text>
      ) : null}

      {suggest.isError ? (
        <Text style={styles.hint}>
          {humanErrorOrNull(suggest.error, 'Could not suggest just now.')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  input: {
    marginTop: spacing.xs,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
});
