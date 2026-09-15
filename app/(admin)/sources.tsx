import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  ListSkeleton,
  ScreenHeader,
  Toast,
} from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useAddVettedSource,
  useRemoveVettedSource,
  useVettedSources,
  type VettedSource,
} from '@/hooks';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

/**
 * The vetted-sources whitelist.
 *
 * SURFACE ONLY, AND THE SCREEN SAYS SO. Nothing reads this list, no listing is
 * fetched from any of these sources, and no outreach is created from one. It
 * records which sources WOULD be acceptable if the deferred feature behind it
 * is ever built — kept now while the reasoning is fresh rather than
 * reconstructed later from memory.
 *
 * Saying that on the screen matters more than it looks. An admin who added
 * three sources and saw nothing happen would reasonably conclude the app was
 * broken, and might spend a while proving it.
 */
export default function AdminSources() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const sources = useVettedSources();
  const add = useAddVettedSource();
  const remove = useRemoveVettedSource();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [rationale, setRationale] = useState('');
  const [attempted, setAttempted] = useState(false);

  const [removing, setRemoving] = useState<VettedSource | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function submit() {
    setAttempted(true);
    if (!name.trim() || !url.trim() || rationale.trim().length < 3) return;

    add.mutate(
      {
        name: name.trim(),
        url: url.trim(),
        ...(sourceType.trim() ? { sourceType: sourceType.trim() } : {}),
        rationale: rationale.trim(),
      },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
          setSourceType('');
          setRationale('');
          setAttempted(false);
          setShowForm(false);
          setToast('Added to the list.');
        },
      }
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Vetted sources" fallback="/(admin)/overview" />

      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]} showsVerticalScrollIndicator={false}>
        <View style={styles.explainCard}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
          <Text style={styles.explainText}>
            This is a record, not a feed. Nothing on this list is read by VHub, no listing is fetched
            from any of these sources, and no outreach is created from one. It exists so that the
            sources you would be willing to trust, and the reason each was accepted, are written
            down while you still remember them.
          </Text>
        </View>

        {sources.isLoading ? (
          <ListSkeleton rows={2} rowHeight={110} />
        ) : sources.isError ? (
          <ErrorState
            message={
              humanError(sources.error, 'Could not load the sources.')
            }
            onRetry={() => sources.refetch()}
          />
        ) : (sources.data ?? []).length === 0 ? (
          <EmptyState
            icon="link-variant"
            title="No sources yet"
            message="Add the bodies whose public outreach listings you would be willing to trust: a ministry, a teaching hospital, an NGO umbrella, a professional council."
          />
        ) : (
          <View style={styles.list}>
            {(sources.data ?? []).map((source) => (
              <View key={source.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="link-variant" size={18} color={colors.primary} />
                  <Text style={styles.name} numberOfLines={1}>
                    {source.name}
                  </Text>
                  {source.source_type ? (
                    <Text style={styles.typeTag}>{source.source_type}</Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => {
                    // Bare domains are common here and Linking rejects a URL
                    // with no scheme, so one is added rather than the tap doing
                    // nothing at all.
                    const href = /^https?:\/\//i.test(source.url) ? source.url : `https://${source.url}`;
                    void Linking.openURL(href).catch(() => {});
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${source.url}`}
                >
                  <Text style={styles.url} numberOfLines={1}>
                    {source.url}
                  </Text>
                </Pressable>

                <Text style={styles.rationale}>{source.rationale}</Text>

                <Button
                  title="Remove"
                  variant="outline"
                  onPress={() => {
                    setRemoving(source);
                    setRemoveReason('');
                  }}
                  style={styles.removeButton}
                />
              </View>
            ))}
          </View>
        )}

        {showForm ? (
          <View style={styles.form}>
            <Text style={styles.formHeading}>Add a source</Text>
            <Input
              label="Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="Ghana Health Service"
              error={attempted && !name.trim() ? 'Give it a name.' : undefined}
            />
            <Input
              label="Website or domain"
              required
              value={url}
              onChangeText={setUrl}
              placeholder="ghs.gov.gh"
              autoCapitalize="none"
              error={attempted && !url.trim() ? 'Give a website or a domain.' : undefined}
            />
            <Input
              label="Kind of body"
              value={sourceType}
              onChangeText={setSourceType}
              placeholder="Ministry, teaching hospital, NGO umbrella…"
            />
            <Input
              label="Why it is trusted"
              required
              value={rationale}
              onChangeText={setRationale}
              placeholder="What makes their listings reliable"
              multiline
              error={
                attempted && rationale.trim().length < 3
                  ? 'A whitelist without reasons is a list somebody has to take on trust.'
                  : undefined
              }
            />
            {add.error ? <Text style={styles.errorText}>{humanError(add.error)}</Text> : null}
            <View style={styles.formActions}>
              <Button
                title={add.isPending ? 'Saving…' : 'Add it'}
                onPress={submit}
                disabled={add.isPending}
                style={styles.formButton}
              />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setShowForm(false);
                  setAttempted(false);
                }}
                style={styles.formButton}
              />
            </View>
          </View>
        ) : (
          <Button title="Add a source" onPress={() => setShowForm(true)} style={styles.addButton} />
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!removing}
        icon="link-off"
        tone="destructive"
        title={removing ? `Remove ${removing.name}?` : ''}
        message="The entry goes, but the record of it, including why it was accepted in the first place, stays in the activity log."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        busy={remove.isPending}
        onConfirm={() => {
          if (!removing || removeReason.trim().length < 3) return;
          remove.mutate(
            { id: removing.id, reason: removeReason.trim() },
            {
              onSuccess: () => {
                setRemoving(null);
                setRemoveReason('');
                setToast('Removed.');
              },
            }
          );
        }}
        onCancel={() => {
          setRemoving(null);
          setRemoveReason('');
        }}
      >
        <Input
          label="Why"
          required
          value={removeReason}
          onChangeText={setRemoveReason}
          placeholder="What changed"
          multiline
        />
        {remove.error ? <Text style={styles.errorText}>{humanError(remove.error)}</Text> : null}
      </ConfirmDialog>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  explainCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
  },
  explainText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  list: { gap: spacing.md },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  typeTag: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textSecondary },
  url: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.primary },
  rationale: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  removeButton: { marginTop: spacing.sm },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  formHeading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  formActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  formButton: { flex: 1 },
  addButton: { marginTop: spacing.sm },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.danger },
});
