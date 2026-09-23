import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  ConfirmDialog,
  ErrorAlert,
  ErrorState,
  Toast,
  FlyerBackground,
  ListSkeleton,
  daysUntilEvent,
  formatEventDate,
  formatEventTimeRange,
  hasEventEnded,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useCompleteOrCancelOutreach,
  useDeleteOutreach,
  useOutreach,
  useOutreachApplications,
  useOutreachDays,
} from '@/hooks';
import { formatDaySpan, hasFirstDayArrived, hoursVaryByDay, lastDay } from '@/lib/outreachDays';
import { isUnderSubscribed, placesRemaining } from '@/lib/underSubscription';
import { useAuthStore } from '@/stores/authStore';
import type { OutreachStatus } from '@/types/database';
import { humanError } from '@/lib/errorMessage';
import { useTabBarContentPadding } from '@/components/ui/tabBarOptions';

const STATUS_TONE: Record<OutreachStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'warning',
  completed: 'navy',
  cancelled: 'danger',
};

const STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * The organisation's management screen for ONE outreach — the event's home.
 *
 * WHY THIS SCREEN EXISTS. Check-in and Mark attendance had been living on
 * Applicant Vetting, which is the wrong place: that screen is for deciding who
 * gets a place, and those two are event-DAY actions. A different job at a
 * different moment. They had no correct home because the organisation had no
 * per-outreach screen at all — the dashboard card jumped straight to the
 * applicant list — so they kept being wedged wherever there was room.
 *
 * This is that home. Everything about one event in one place: what it is, how
 * the roster stands, the way through to its applicants, and the two event-day
 * actions. They stay here and stop migrating.
 */
export default function OrganisationOutreachDetail() {
  // The floating tab bar is absolute and reserves no space, so the last
  // element needs this or it sits under the pill and cannot be tapped.
  const tabBarPadding = useTabBarContentPadding();
  const router = useRouter();
  const { id, saved, created, from } = useLocalSearchParams<{
    id: string;
    saved?: string;
    created?: string;
    /**
     * Where the back arrow goes. This screen sits in a tab group, which keeps
     * no history, so `back()` would unwind onto the first tab rather than the
     * screen the user came from. The notification inbox has always SENT this
     * (lib/notificationPresentation.ts) and this screen simply never read it,
     * so an organisation opening an outreach notification and pressing back
     * was put on the Dashboard with its other unread notifications two taps
     * away. The volunteer's copy of this screen has read it all along.
     */
    from?: string;
  }>();
  const organisationId = useAuthStore((s) => s.user)?.id;

  /*
    THE CONFIRMATION IS SCOPED TO THE EVENT THAT PRODUCED IT.

    It used to be a bare boolean set from a `saved=1` param. This screen is a
    tab screen and stays mounted, so both the flag and the param outlived the
    save: the banner reappeared on other events and on later visits, cheerfully
    reporting a save that had nothing to do with what was on screen.

    Carrying the OUTREACH ID instead makes it self-limiting — it can only ever
    show on the event it belongs to — and the id is compared to the route rather
    than trusted, so navigating away drops it without needing anything cleared.
  */
  const [savedFor, setSavedFor] = useState<string | null>(saved && saved !== '1' ? saved : null);
  // Publishing lands here too, with the same self-limiting id and a different
  // sentence — "saved" is not what an organisation wants to read about an event
  // that has just gone live.
  const [createdFor, setCreatedFor] = useState<string | null>(created ?? null);
  useEffect(() => {
    if (!created) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a one-shot route param and clears it, so it cannot be resurrected from the URL
    setCreatedFor(created);
    router.setParams({ created: '' });
  }, [created, router]);

  useEffect(() => {
    if (!saved || saved === '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a one-shot route param and clears it, so it cannot be resurrected from the URL
    setSavedFor(saved);
    // Cleared immediately so a re-render, a refetch or a later visit cannot
    // resurrect it from the URL.
    router.setParams({ saved: '' });
  }, [saved, router]);

  // Belt and braces: even if the timer has not fired, the banner is only ever
  // shown on the event whose save produced it.
  const savedNotice = savedFor !== null && savedFor === id;
  const createdNotice = createdFor !== null && createdFor === id;

  const outreachQuery = useOutreach(id);
  const outreach = outreachQuery.data;

  // Needed for "is it over?", which must read the LAST day rather than
  // `outreaches.date`. Falls back to the outreach's own date while it loads,
  // which is exactly right for the one-day event most of them are.
  const daysQuery = useOutreachDays(id);
  const eventDayStrings = useMemo(
    () => (daysQuery.data ?? []).map((day) => day.day),
    [daysQuery.data]
  );

  const completeOrCancel = useCompleteOrCancelOutreach();
  const deleteOutreach = useDeleteOutreach();
  const [confirming, setConfirming] = useState<'completed' | 'cancelled' | 'delete' | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const applicationsQuery = useOutreachApplications(id);
  const applications = useMemo(() => applicationsQuery.data ?? [], [applicationsQuery.data]);

  // Only the pending count survives here, as the Applicants row's subtitle. The
  // full per-status tally moved to Applicant Vetting with the rest of the
  // decision surface — see the Roster comment below.
  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === 'pending').length,
    [applications]
  );

  const acceptedVolunteers = useMemo(
    () => applications.filter((a) => a.status === 'accepted'),
    [applications]
  );

  if (outreachQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={4} rowHeight={100} />
      </SafeAreaView>
    );
  }

  if (outreachQuery.isError || !outreach) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              humanError(outreachQuery.error, 'This outreach could not be loaded.')
            }
            onRetry={() => outreachQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Someone else's outreach has no management surface at all.
  if (outreach.organisation_id !== organisationId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message="You can only manage outreaches your organisation created."
            onRetry={() => router.replace('/(organisation)/dashboard')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const place = [outreach.location_name, outreach.district, outreach.region].filter(Boolean).join(', ');
  const daysOut = daysUntilEvent(outreach.date);
  /*
    OVER MEANS THE LAST DAY HAS ENDED, not the first.

    `outreaches.date` is the first day, so a three-day clinic judged on it was
    "over" from the evening of day one — which offered "Mark as completed" and
    withdrew "Cancel this event" while the event still had two days to run. Both
    are wrong in the same direction: they treat a running event as a finished
    one.

    `started` correctly keeps reading the FIRST day. An event has begun when its
    first day begins, and that is what decides whether there is any attendance to
    mark yet.
  */
  const finalDay = lastDay(eventDayStrings) ?? outreach.date;
  const eventOver = hasEventEnded(finalDay, outreach.end_time);
  /*
    STARTED IS A DAY QUESTION, NOT A CLOCK QUESTION.

    This was `!isUpcomingEvent(outreach.date, outreach.start_time)` — has the
    event's stated start time passed. That disagreed with check-in, which is
    gated on the calendar DAY alone: `/api/checkin` finds today's row in
    `outreach_days` and never looks at `start_time`.

    So on the morning of an event, before its stated start, a volunteer could
    scan and be recorded present while this screen still hid "Mark attendance"
    from the organiser — attendance existing that the organiser could not open.
    Reported from a device on 2026-08-20.

    The day is the honest unit, because it is the unit attendance is keyed on.
  */
  const started = hasFirstDayArrived(
    eventDayStrings.length > 0 ? eventDayStrings : [outreach.date]
  );
  const isDraft = outreach.status === 'draft';

  /*
    WHICH LIFECYCLE ACTIONS THIS EVENT CAN TAKE.

    `completed` is an ARCHIVAL act, not a gate: it means "I have wrapped this
    up". It deliberately does not close attendance or reviews, because reviews
    are filed days later and are what move V-Scores — an organiser who tidies
    up promptly must not lock themselves out of them.

    `cancelled` means the event is not happening. It is offered while the event
    is still ahead, because cancelling one that has already taken place says
    something untrue about it. It is terminal: the database refuses to move an
    outreach back out of it, so the volunteers who were told are never silently
    re-enrolled.

    Deleting is only ever offered when NOBODY has touched the event. Once an
    application exists, the outreach is part of someone else's record — their
    history, their schedule, and the event rows their V-Score is derived from —
    and none of that is the organisation's to erase. The database enforces this
    too (trg_outreaches_refuse_used_delete); this is the half that explains it
    rather than refusing at the last moment.
  */
  const isCancelled = outreach.status === 'cancelled';
  const canComplete = !isCancelled && !isDraft && eventOver && outreach.status !== 'completed';
  const canCancel = !isCancelled && !eventOver && outreach.status !== 'completed';
  const untouched = applications.length === 0;
  const canDelete = !isCancelled && untouched;
  const busy = completeOrCancel.isPending || deleteOutreach.isPending;

  function runLifecycle(action: 'completed' | 'cancelled' | 'delete') {
    if (!organisationId) return;
    setLifecycleError(null);

    if (action === 'delete') {
      deleteOutreach.mutate(
        { outreachId: outreach!.id, organisationId },
        {
          onSuccess: () => {
            setConfirming(null);
            router.replace('/(organisation)/dashboard');
          },
          onError: (error) => {
            setConfirming(null);
            setLifecycleError(humanError(error, 'Could not delete this outreach.'));
          },
        }
      );
      return;
    }

    completeOrCancel.mutate(
      { outreachId: outreach!.id, organisationId, status: action },
      {
        onSuccess: () => setConfirming(null),
        onError: (error) => {
          setConfirming(null);
          setLifecycleError(
            humanError(error, 'Could not update this outreach.')
          );
        },
      }
    );
  }

  const short =
    daysOut !== null &&
    daysOut >= 0 &&
    isUnderSubscribed({
      status: outreach.status,
      slotsFilled: outreach.slots_filled,
      slotsTotal: outreach.slots_total,
    });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace((from ?? '/(organisation)/dashboard') as never)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage event</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, tabBarPadding]}>
        <FlyerBackground uri={outreach.flyer_url} style={styles.hero}>
          <View style={styles.heroContent}>
            <Badge label={STATUS_LABEL[outreach.status]} tone={STATUS_TONE[outreach.status]} />
            <Text style={styles.heroTitle}>{outreach.title}</Text>
          </View>
        </FlyerBackground>

        {/* ---------- When and where ---------- */}
        <View style={styles.card}>
          {/*
            The rows that DISPLAY the date and the place also open the editor
            at the section that owns them. Seeing a wrong time and having to
            find the pencil, then scroll past two sections to reach it, was the
            long way round to the shortest edit there is.
          */}
          <DetailRow
            icon="calendar"
            label="DATE"
            onPress={() =>
              router.push(`/(organisation)/edit-outreach/${outreach.id}?section=when`)
            }
          >
            {formatDaySpan(eventDayStrings) || formatEventDate(outreach.date)}
            {/*
              The event's hours only where every day actually runs to them. A
              day may have its own, and printing one range beside a four-day
              span would then be wrong for one of those days. The organisation
              set those hours themselves, so the honest summary names the
              variation and the editor shows which day.
            */}
            {hoursVaryByDay(daysQuery.data ?? [], outreach)
              ? ' · Hours vary by day'
              : timeRange
                ? ` · ${timeRange}`
                : ''}
          </DetailRow>
          {place ? (
            <DetailRow
              icon="map-marker-outline"
              label="LOCATION"
              onPress={() =>
                router.push(`/(organisation)/edit-outreach/${outreach.id}?section=when`)
              }
            >
              {place}
            </DetailRow>
          ) : null}
          {daysOut !== null && !eventOver ? (
            <DetailRow icon="clock-outline" label="COUNTDOWN">
              {daysOut === 0 ? 'Today' : daysOut === 1 ? 'Tomorrow' : `In ${daysOut} days`}
            </DetailRow>
          ) : null}
        </View>

        {/*
          THE DESCRIPTION SITS UNDER THE FACTS AND ABOVE THE ROSTER (owner,
          2026-09-21: "the description box should sit under the info card and
          before the roster. It is currently below Actions").

          It belongs with the event, not after the controls. What the event IS
          reads as part of the same thought as where and when it is; pushed
          below five action rows it became a footnote, and an organiser
          checking their own wording had to scroll past everything they could
          DO to the event to find what they had SAID about it.
        */}
        {outreach.description ? (
          <>
            <Text style={styles.sectionLabel}>DESCRIPTION</Text>
            <View style={styles.card}>
              <Text style={styles.description}>{outreach.description}</Text>
            </View>
          </>
        ) : null}

        {/* ---------- Roster ----------

            THE SUMMARY ONLY. How full the event is, who is confirmed, and
            whether it is short. Everything that is an input to a DECISION —
            per-role slot progress, pending and waitlisted counts, skill
            coverage, the batch accept button — lives on Applicant Vetting,
            because that is the screen where the organiser acts on it.

            The Pending/Accepted/Waitlisted tally that used to sit here was
            removed for two reasons. It duplicated Applicant Vetting's roster
            card, so the two would drift; and in multi-role mode it was a
            single blended total across every role, which is actively
            misleading — "4 pending" reads as progress when it is four nurses
            and no doctors, and this screen has no way to break that down
            without becoming the applicant screen. The one figure that IS
            actionable from an overview, how many are waiting for a decision,
            is on the Applicants row below: on the link that resolves it.

            The two screens now also read different sources, so they cannot
            disagree. This bar comes from the trigger-maintained
            slots_filled/slots_total columns; Applicant Vetting derives its
            per-role figures from the applications themselves.
        */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Roster</Text>
            <Text style={styles.cardMeta}>
              {outreach.slots_filled} of {outreach.slots_total} filled
            </Text>
          </View>

          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${outreach.slots_total > 0 ? Math.min(100, (outreach.slots_filled / outreach.slots_total) * 100) : 0}%`,
                },
              ]}
            />
          </View>

          {/*
            Under-subscription, stated and nothing more. No suggestion to
            reduce slots or move the date — see lib/underSubscription.ts.
          */}
          {short ? (
            <View style={styles.shortfall}>
              <MaterialCommunityIcons name="account-alert-outline" size={15} color={colors.warning} />
              <Text style={styles.shortfallText}>
                {placesRemaining({
                  slotsFilled: outreach.slots_filled,
                  slotsTotal: outreach.slots_total,
                })}{' '}
                still to fill.
              </Text>
            </View>
          ) : null}

          {acceptedVolunteers.length > 0 ? (
            <View style={styles.avatarRow}>
              {acceptedVolunteers.slice(0, 6).map((application) => (
                <Avatar
                  key={application.id}
                  name={application.volunteer?.profile?.full_name ?? 'Volunteer'}
                  uri={application.volunteer?.profile?.avatar_url}
                  size={32}
                />
              ))}
              {acceptedVolunteers.length > 6 ? (
                <Text style={styles.avatarOverflow}>+{acceptedVolunteers.length - 6}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ---------- Actions ---------- */}
        <Text style={styles.sectionLabel}>ACTIONS</Text>

        <ActionRow
          icon="account-multiple-outline"
          title="Applicants"
          meta={
            pendingCount > 0
              ? `${pendingCount} waiting for a decision`
              : 'Review and decide who gets a place'
          }
          onPress={() =>
            router.push({ pathname: '/(organisation)/applicants', params: { outreachId: outreach.id } })
          }
        />

        {/*
          THE "EDIT EVENT DETAILS" ROW IS GONE (owner, 2026-09-21: "since the
          pencil icon already appears on the info card, is the separate Edit
          Event card even needed?").

          It was not. Every row of the info card above is itself a shortcut
          into the editor, each carrying a pencil and each landing on the field
          it names -- which is strictly better than one row landing on the top
          of the form. Keeping both meant two routes to the same screen, one of
          them less useful, taking a fifth of the space in a list the owner
          already found too compressed.

          Nothing became unreachable: the editor is one tap from any fact on
          the card, on every status including finished events.
        */}
        {/*
          The check-in QR's permanent home. Hidden for drafts: an unpublished
          outreach has no accepted volunteers, so nobody could scan it.
        */}
        {!isDraft ? (
          <ActionRow
            icon="qrcode"
            title="Show check-in code"
            meta="Display this at the venue for volunteers to scan."
            onPress={() => router.push(`/(organisation)/checkin/${outreach.id}`)}
          />
        ) : null}

        {/*
          Only once the event has actually started. Before that there is
          nothing to mark, and offering it early invites an organiser to
          "confirm" a roster for an event nobody has attended yet.
        */}
        {!isDraft && started ? (
          <ActionRow
            icon="clipboard-check-outline"
            title="Mark attendance"
            meta="Everyone counts as present. Flag only the no-shows."
            onPress={() => router.push(`/(organisation)/attendance/${outreach.id}`)}
          />
        ) : null}

        {canComplete ? (
          <ActionRow
            icon="check-decagram-outline"
            title="Mark as completed"
            meta="Wraps this event up. Attendance and reviews stay open."
            onPress={() => setConfirming('completed')}
          />
        ) : null}

        {/* ---------- Cancelled banner ----------

            A cancelled event keeps its whole management surface -- the roster,
            the applicants, the reviews -- because the organisation still needs
            to see who had been coming. Only the state at the top changes.
        */}
        {isCancelled ? (
          <View style={styles.cancelledNotice}>
            <MaterialCommunityIcons name="calendar-remove" size={18} color={colors.danger} />
            <Text style={styles.cancelledText}>
              This event was cancelled and everyone who had applied has been told. It cannot be
              reopened -- create a new outreach instead.
            </Text>
          </View>
        ) : null}

        {/* ---------- Ending it ----------

            Separated and labelled rather than sitting in ACTIONS with the
            everyday controls, because these two cannot be undone and should
            not be reachable by a mistap on the way to Applicants.
        */}
        {/*
          Shown whenever there is something to SAY, not only when there is
          something to press. With the old condition an event that could
          neither be cancelled (already over) nor deleted (someone applied)
          showed no section at all, so the absence of Delete looked like an
          oversight rather than a rule. A refusal the organisation cannot see
          is indistinguishable from a missing feature.
        */}
        {canCancel || canDelete || !untouched || isCancelled ? (
          <>
            <Text style={styles.sectionLabel}>ENDING THIS EVENT</Text>

            {canDelete ? (
              <ActionRow
                icon="trash-can-outline"
                title="Delete this outreach"
                meta="Nobody has applied yet, so it can be removed completely."
                tone="danger"
                onPress={() => setConfirming('delete')}
              />
            ) : null}

            {canCancel ? (
              <ActionRow
                icon="calendar-remove-outline"
                title="Cancel this event"
                meta={
                  untouched
                    ? 'Tells anyone who applies later that it is off.'
                    : `Tells all ${applications.length} applicant${
                        applications.length === 1 ? '' : 's'
                      } it is not happening.`
                }
                tone="danger"
                onPress={() => setConfirming('cancelled')}
              />
            ) : null}

            {!canDelete && !untouched && !isCancelled ? (
              <Text style={styles.dangerNote}>
                {applications.length} {applications.length === 1 ? 'person has' : 'people have'}{' '}
                applied, so this event cannot be deleted. Their records are not yours to remove.
              </Text>
            ) : null}

            {canDelete && !canCancel ? (
              <Text style={styles.dangerNote}>
                This event has already taken place, so there is nothing to cancel. Nobody applied,
                so it can still be deleted.
              </Text>
            ) : null}
          </>
        ) : null}

        {/*
          A POPUP, not a line at the foot of the page. This is the result of
          confirming Delete, Cancel event or Mark completed: the dialog closes,
          and the refusal used to be written as the LAST element of a very long
          ScrollView, which the organisation is not looking at and may not even
          have scrolled to. That is indistinguishable from the confirmation
          having done nothing.
        */}
        <ErrorAlert error={lifecycleError} fallback="That action could not be completed." />
      </ScrollView>

      {/*
        Over the screen, not in it. An inline confirmation card pushed the whole
        event down when it appeared and back up when it went, and read as part
        of the event rather than as a reply to what the organisation had just
        done.
      */}
      <Toast
        message={
          createdNotice
            ? outreach.status === 'draft'
              ? 'Saved as a draft. Publish it when you are ready.'
              : 'Published. Volunteers can find this outreach now.'
            : savedNotice
              ? 'Your changes have been saved.'
              : null
        }
        onDismiss={() => {
          setCreatedFor(null);
          setSavedFor(null);
        }}
      />

      <ConfirmDialog
        visible={confirming === 'completed'}
        icon="check-decagram-outline"
        title="Mark this event as completed?"
        message="This records that you have wrapped it up. Marking attendance and filing reviews stay open afterwards, so you can still do those."
        confirmLabel="Mark completed"
        cancelLabel="Not yet"
        busy={busy}
        onConfirm={() => runLifecycle('completed')}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        visible={confirming === 'cancelled'}
        icon="calendar-remove-outline"
        tone="destructive"
        title="Cancel this event?"
        message={
          applications.length > 0
            ? 'Everyone who applied will be told it is not happening. Nobody is marked as having withdrawn, so no volunteer takes a V-Score penalty for this. It cannot be undone.'
            : 'The event will show as cancelled and can no longer be applied to. This cannot be undone.'
        }
        confirmLabel="Cancel the event"
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={() => runLifecycle('cancelled')}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        visible={confirming === 'delete'}
        icon="trash-can-outline"
        tone="destructive"
        title="Delete this outreach?"
        message="It will be removed completely. Nobody has applied, so nothing of anyone else's goes with it."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={() => runLifecycle('delete')}
        onCancel={() => setConfirming(null)}
      />
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  children,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  children: React.ReactNode;
  /** Makes the row a shortcut into the editor. Omitted, it stays plain text. */
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.detailIconColumn}>
        {/* primary, not textSecondary: a grey glyph on white was the
            "too pale" half of the report. */}
        <MaterialCommunityIcons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.detailTextBlock}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailText}>{children}</Text>
      </View>
      {onPress ? (
        <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.detailRow}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label.toLowerCase()}`}
      style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function ActionRow({
  icon,
  title,
  meta,
  onPress,
  tone = 'default',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  meta: string;
  onPress: () => void;
  /** 'danger' colours the icon and title for the irreversible actions. */
  tone?: 'default' | 'danger';
}) {
  const accent = tone === 'danger' ? colors.danger : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.actionIconTile,
          { backgroundColor: tone === 'danger' ? 'rgba(239, 68, 68, 0.12)' : colors.surface },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.actionText}>
        <Text style={[styles.actionTitle, tone === 'danger' && styles.dangerTitle]}>{title}</Text>
        <Text style={styles.actionMeta}>{meta}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 22,
  },
  // Sections are separated by one gap rule rather than per-child margins, so
  // nothing ends up jammed flush against its neighbour.
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },
  cancelledNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  cancelledText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textPrimary,
  },
  dangerTitle: {
    color: colors.danger,
  },
  dangerNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
  },
  dangerError: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  savedNoticeText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  hero: {
    borderRadius: radius.lg,
    // Matched to the volunteer's detail hero, so an organisation checking its
    // own event sees the banner at the size volunteers actually get.
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.white,
  },
  card: {
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.base,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    justifyContent: 'space-between',
    // Wraps instead of clipping when the row outgrows its width at a large
    // system font size. rowGap only applies between wrapped lines, so a row
    // that still fits on one is unaffected.
    flexWrap: 'wrap',
    rowGap: 4,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  cardMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  shortfall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shortfallText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',

    // alignItems centres children within their line; alignContent places
    // the line itself, and defaults to flex-start. Without it a wrapping row
    // pins its single line to the TOP of the box.
    alignContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  avatarOverflow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  /*
    A TILE, NOT A BARE GLYPH (owner, 2026-09-21: "the calendar icon sits
    clearly above the date text rather than level with it. The icons are also
    too pale. Make them larger or stronger, and align each one with the first
    line of its text").

    Both faults had one cause. The row is `alignItems: 'flex-start'`, which is
    right -- centring stranded the pin beside line 2 of a two-line address --
    but the first line of this row is the LABEL, a 10px uppercase caption, not
    the value. So a 16px glyph anchored to the top of the row sat level with
    "DATE & TIME" and therefore visibly above the date itself, which is the
    text anybody is actually reading.

    A 32dp tile spans the caption and the first line of the value together, so
    its centre falls on the join between them and it reads as level with the
    pair rather than perched on top of it. The tile also solves the paleness
    without inventing a colour: a filled ground gives the glyph something to
    sit on, so a 18px accent icon on `surface` carries at arm's length where a
    16px grey glyph on white did not. It is the same stat-icon treatment the
    application and feed cards already use, so the three read as one app.
  */
  detailIconColumn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextBlock: {
    flex: 1,
  },
  detailLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  detailText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  /*
    ROOM TO BREATHE (owner, 2026-09-21: "the five action cards are too
    compressed. Revamp or resize them rather than squeezing").

    Four things were squeezing them at once: 12dp of vertical padding, an
    11px meta line with no line-height of its own, NO GAP between one card and
    the next, and a bare 20px glyph with nothing separating it from the title.
    Five of those stacked flush read as one striped block rather than as five
    things you can do.

    The gap is the change that does most of the work -- it is what makes them
    read as separate cards -- and the icon tile is the same 40dp treatment the
    info rows above now use, so the two halves of the screen agree. One of the
    five has also gone: see the note where the edit row used to be.
  */
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    minHeight: 72,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  actionIconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  actionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    // A real line height: at 11px with none, a meta that wrapped to two lines
    // closed up into a grey smudge under the title.
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 3,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
  },
});
