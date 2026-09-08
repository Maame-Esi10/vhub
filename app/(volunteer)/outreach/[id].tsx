import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  FlyerBackground,
  ListSkeleton,
  Toast,
  formatEventDate,
  formatEventTimeRange,
  isUpcomingEvent,
} from '@/components/ui';
import {
  DayCommitmentPicker,
  DayReleaseSheet,
  FullApplicationSheet,
  GalleryStrip,
  MatchScoreBadge,
  RolePicker,
  WithdrawSheet,
} from '@/components/volunteer';
import { VOLUNTEER_CATEGORIES } from '@/constants/categories';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import {
  useApplicationDays,
  useCancelApplication,
  useCreateApplication,
  useMyApplicationForOutreach,
  useMyLateReleaseCount,
  useOutreach,
  useOutreachDays,
  useOutreachImages,
  useOutreachRoles,
  usePublicOrganisationProfile,
  useReleaseCommittedDay,
} from '@/hooks';
import { formatDaySpan, hoursVaryByDay } from '@/lib/outreachDays';
import { useAuthStore } from '@/stores/authStore';
import type { ApplicationStatus } from '@/types/database';

const STATUS_MESSAGE: Record<ApplicationStatus, string> = {
  pending: "You've applied. The organisation is reviewing your application.",
  accepted: "You're in. This event is on your schedule.",
  rejected: 'You were not selected for this outreach.',
  waitlisted: "You're on the waitlist. The organisation will be in touch if a slot frees up.",
  not_selected: 'This event filled up before a place could be offered to you.',
  cancelled: 'You withdrew from this outreach.',
};

export default function OutreachDetail() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const outreachId = typeof id === 'string' ? id : undefined;

  const user = useAuthStore((state) => state.user);
  const volunteerProfile = useAuthStore((state) => state.volunteerProfile);
  const volunteerId = user?.id;

  const outreachQuery = useOutreach(outreachId);
  const myApplicationQuery = useMyApplicationForOutreach(volunteerId, outreachId);
  const createApplication = useCreateApplication();
  const cancelApplication = useCancelApplication();

  const [fullFormVisible, setFullFormVisible] = useState(false);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [releaseVisible, setReleaseVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  /*
    THE DAYS THIS VOLUNTEER IS COMMITTING TO.

    Held here rather than inside the application sheet because BOTH ways in
    need it — Quick Join is one tap with no sheet at all, and a quick join to a
    four-day campaign still has to say which days it means.

    `null` means "not chosen yet", which is different from "chose none": it is
    the state before the days have even loaded, and it is what makes the
    every-day default below correct rather than a silent overwrite of a real
    choice.
  */
  const [committedDayIds, setCommittedDayIds] = useState<string[] | null>(null);
  const daysQuery = useOutreachDays(outreachId);
  const days = useMemo(() => daysQuery.data ?? [], [daysQuery.data]);
  const multiDay = days.length > 1;

  // Everything ticked to begin with: most volunteers applying to a three-day
  // clinic mean all three, so un-ticking is the deliberate act rather than
  // ticking. Re-seeded whenever the day list itself changes, and never once the
  // volunteer has touched it.
  useEffect(() => {
    if (days.length === 0) return;
    setCommittedDayIds((current) => {
      if (current && current.every((dayId) => days.some((day) => day.id === dayId))) {
        return current;
      }
      return days.map((day) => day.id);
    });
  }, [days]);

  const dayIdsForApplication = committedDayIds ?? days.map((day) => day.id);
  // Only ever blocks a multi-day application. A one-day outreach has nothing
  // to choose and commits to its only day.
  const noDaysChosen = multiDay && dayIdsForApplication.length === 0;

  // Empty means single-role mode — the same rule the database uses.
  const rolesQuery = useOutreachRoles(outreachId);
  // The event's poster and photographs. Entirely separate from the flyer,
  // which still heads the hero above and is untouched by this.
  const imagesQuery = useOutreachImages(outreachId);
  const roles = rolesQuery.data ?? [];
  const usesRoles = roles.length > 0;
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  // Same lookup RolePicker uses, so the gate names the role by the label the
  // volunteer just tapped rather than a raw category value.
  const selectedRoleLabel = selectedRole
    ? VOLUNTEER_CATEGORIES.find((c) => c.value === selectedRole.category)?.label ??
      selectedRole.category
    : null;

  const outreach = outreachQuery.data;
  const application = myApplicationQuery.data ?? null;
  // Only for the logo. The outreach embed already carries the name, type and
  // verified flag; the avatar is the one public field it cannot reach.
  const organisationProfileQuery = usePublicOrganisationProfile(outreach?.organisation?.id);
  const isClinical = outreach?.role_type === 'clinical';
  const isVerified = volunteerProfile?.verification_status === 'verified';
  // A document already sent and waiting on a human. Distinguished from plain
  // 'unverified' because the two need opposite things said to them: one has
  // something to do, the other has already done it and is waiting.
  const awaitingReview = volunteerProfile?.verification_status === 'documents_pending';
  // CLAUDE.md's Phase 2 eligibility rule: an unverified volunteer may browse
  // everything and Quick Join support roles, but may not submit a full
  // application to a clinical outreach. applications_insert_own enforces this
  // server-side too — this branch is what turns that refusal into an
  // explanation and a way forward.
  //
  // On a multi-role outreach the gate reads the ROLE the volunteer picked, not
  // the outreach. `outreaches.role_type` only summarises to 'clinical' if ANY
  // role is, so gating on it would lock an unverified volunteer out of the
  // support roles of a mixed event — which is precisely the failure multi-role
  // exists to fix. Nothing is blocked until a role is chosen.
  const blockedByVerification = usesRoles
    ? selectedRole !== null && selectedRole.role_type === 'clinical' && !isVerified
    : isClinical && !isVerified;

  const { matchingSkills, missingSkills } = useMemo(() => {
    const required = outreach?.required_skills ?? [];
    const mine = new Set(volunteerProfile?.skill_tags ?? []);
    return {
      matchingSkills: required.filter((skill) => mine.has(skill)),
      missingSkills: required.filter((skill) => !mine.has(skill)),
    };
  }, [outreach?.required_skills, volunteerProfile?.skill_tags]);

  function handleQuickJoin() {
    if (!outreachId || !volunteerId || !outreach) return;
    createApplication.mutate({
      outreachId,
      volunteerId,
      type: 'quick_join',
      outreachRoleId: selectedRoleId,
      dayIds: dayIdsForApplication,
      // What this screen already knows, so a refusal can name ONE real reason
      // instead of listing every clause the policy folds together.
      eligibility: {
        outreachStatus: outreach.status,
        roleIsClinical: usesRoles ? selectedRole?.role_type === 'clinical' : isClinical,
        volunteerIsVerified: isVerified,
      },
    });
  }

  function handleFullSubmit(motivation: string) {
    if (!outreachId || !volunteerId || !outreach) return;
    createApplication.mutate(
      {
        outreachId,
        volunteerId,
        type: 'full',
        motivation,
        outreachRoleId: selectedRoleId,
        dayIds: dayIdsForApplication,
        eligibility: {
          outreachStatus: outreach.status,
          roleIsClinical: usesRoles ? selectedRole?.role_type === 'clinical' : isClinical,
          volunteerIsVerified: isVerified,
        },
      },
      { onSuccess: () => setFullFormVisible(false) }
    );
  }

  function handleWithdraw(reason: string | null) {
    if (!application || !outreachId || !volunteerId) return;
    cancelApplication.mutate(
      { applicationId: application.id, volunteerId, outreachId, reason },
      {
        onSuccess: (result) => {
          setWithdrawVisible(false);
          // Said out loud at the moment it happens. `penalty` is null unless
          // they gave up an ACCEPTED place, so withdrawing a pending
          // application says nothing about a score, because nothing moved.
          setToast(
            result.penalty
              ? `Withdrawn. That cost ${Math.abs(result.penalty.points)} V-Score points — you were holding a place. Your score is now ${Math.round(result.penalty.newScore)}.`
              : 'Withdrawn.'
          );
        },
      }
    );
  }

  if (outreachQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ListSkeleton rows={4} rowHeight={90} />
      </SafeAreaView>
    );
  }

  if (outreachQuery.isError || !outreach) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerFill}>
          <ErrorState
            message={
              outreachQuery.error instanceof Error
                ? outreachQuery.error.message
                : 'This outreach could not be loaded.'
            }
            onRetry={() => outreachQuery.refetch()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const timeRange = formatEventTimeRange(outreach.start_time, outreach.end_time);
  const slotsLeft = Math.max(0, outreach.slots_total - outreach.slots_filled);
  const isFull = slotsLeft === 0;
  const alreadyApplied = application !== null && application.status !== 'cancelled';
  /*
    Withdrawal is only meaningful while the event is genuinely ahead. This
    screen previously checked the application's STATUS alone and never looked
    at the date, so "Withdraw application" stayed on an event that had already
    happened — withdrawing from a past event does nothing, and the sheet it
    opened then claimed the event "starts within 24 hours".

    `isUpcomingEvent`, not `hasEventEnded`: once an event has STARTED the
    volunteer is either there or absent, and that is the attendance and review
    path's business, not cancellation's.

    The applications-list card (components/volunteer/VolunteerApplicationCard)
    already gated on the same condition; this screen was the way in that did not.
  */
  const canWithdraw =
    application !== null &&
    (application.status === 'pending' ||
      application.status === 'accepted' ||
      application.status === 'waitlisted') &&
    isUpcomingEvent(outreach.date, outreach.start_time);
  /*
    CHANGING WHICH DAYS YOU ARE ON, once you have already applied.

    Only for an event that runs more than one day, and only while the
    application is live. On a one-day event there is nothing to change that
    withdrawing does not already cover.

    Read separately from `committedDayIds` above, which is the pre-application
    tick list. What has been PROMISED is a database fact; what is ticked on the
    way in is form state, and conflating the two would let a stale form
    overwrite a commitment.
  */
  const applicationActive =
    application !== null &&
    (application.status === 'pending' ||
      application.status === 'accepted' ||
      application.status === 'waitlisted');
  const myCommittedDays = useApplicationDays(applicationActive ? application.id : undefined);
  const lateReleaseCount = useMyLateReleaseCount(applicationActive ? volunteerId : undefined);
  const releaseDay = useReleaseCommittedDay();
  const canChangeDays = applicationActive && days.length > 1 && outreach.status !== 'cancelled';

  const organisation = outreach.organisation;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {/* replace(from), not back(): this screen sits in a tab group, where
            back() unwinds the TAB history onto the first tab (Home) rather
            than the screen the user came from. It has five entry points, so
            the origin is passed in as `from`. */}
        <Pressable
          onPress={() => router.replace((from ?? '/(volunteer)/feed') as never)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Outreach Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <FlyerBackground uri={outreach.flyer_url} style={styles.hero}>
          <View style={styles.heroContent}>
            <MatchScoreBadge onDark />
            <Text style={styles.heroOrg} numberOfLines={1}>
              {organisation?.org_name?.toUpperCase() ?? 'ORGANISATION'}
            </Text>
            <Text style={styles.heroTitle}>{outreach.title}</Text>
          </View>
        </FlyerBackground>

        {/*
          Built from a list rather than four hand-placed rows so the spacing
          stays even when the optional role row is absent.
        */}
        <View style={styles.card}>
          {(
            [
              {
                icon: 'map-marker-outline',
                label: 'LOCATION',
                value:
                  [outreach.location_name, outreach.district, outreach.region]
                    .filter(Boolean)
                    .join(', ') || 'Location to be confirmed',
              },
              {
                icon: 'calendar-outline',
                label: multiDay ? 'DATES & TIME' : 'DATE & TIME',
                // formatDaySpan reads a one-day outreach exactly as
                // formatEventDate did, and says "3 days" or "4 days · Oct 3 –
                // Oct 24" for the rest. It falls back to the outreach's own
                // date if the day rows have not arrived yet, so this row is
                // never blank.
                //
                // ONE RANGE ONLY WHEN THERE IS ONE. A day may run to hours of
                // its own, and printing the event's beside a four-day span
                // would then be a confident statement that is wrong for one of
                // those days. Where they differ this says so and leaves the
                // detail to the day list below, which reads each day's actual
                // hours through dayStartTime/dayEndTime.
                value: `${
                  days.length > 0
                    ? formatDaySpan(days.map((day) => day.day))
                    : formatEventDate(outreach.date)
                }${
                  hoursVaryByDay(days, outreach)
                    ? ' · Hours vary by day'
                    : timeRange
                      ? ` · ${timeRange}`
                      : ''
                }`,
              },
              {
                icon: 'account-multiple-outline',
                label: 'SLOTS',
                value: isFull
                  ? 'All slots filled'
                  : `${slotsLeft} of ${outreach.slots_total} slots open`,
              },
              ...(outreach.role_type
                ? [
                    {
                      icon: 'stethoscope' as const,
                      label: 'ROLE',
                      value:
                        outreach.role_type === 'clinical' ? 'Clinical role' : 'Support role',
                    },
                  ]
                : []),
            ] as const
          ).map((row) => (
            <DetailRow key={row.label} icon={row.icon} label={row.label}>
              {row.value}
            </DetailRow>
          ))}

          {/*
            The link is an action, not another fact, so it needs more air above
            it than one fact needs from the next -- otherwise it reads as
            spilling out of the last row. Separated by space rather than a
            rule, since the card has no rules in it.
          */}
          {organisation ? (
            <Pressable
              onPress={() => router.push(`/profile/organisation/${organisation.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${organisation.org_name} profile`}
              style={styles.orgLink}
            >
              {/*
                The logo comes from the public organisation view rather than
                the outreach embed: `profiles.avatar_url` is row-scoped and the
                embed cannot see it. Falls back to initials, which is what the
                Avatar does with a null uri.
              */}
              <Avatar
                name={organisation.org_name}
                uri={organisationProfileQuery.data?.avatar_url}
                size={28}
              />
              <Text style={styles.orgLinkText}>View organisation profile</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {outreach.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this event</Text>
            <Text style={styles.body}>{outreach.description}</Text>
          </View>
        ) : null}

        {(outreach.required_skills?.length ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your matching skills</Text>
            <View style={styles.chipRow}>
              {matchingSkills.map((skill) => (
                <View key={skill} style={[styles.chip, styles.chipMatched]}>
                  <MaterialCommunityIcons name="check-circle-outline" size={13} color={colors.success} />
                  <Text style={[styles.chipText, styles.chipTextMatched]}>{skill}</Text>
                </View>
              ))}
              {missingSkills.map((skill) => (
                <View key={skill} style={styles.chip}>
                  <Text style={styles.chipText}>{skill}</Text>
                </View>
              ))}
            </View>
            {matchingSkills.length === 0 ? (
              <Text style={styles.hint}>
                None of your saved skills match this outreach yet. You can still apply.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/*
          Renders nothing at all when the outreach has no images — no
          placeholder, no empty frame. Most outreaches will never have a
          gallery, and a permanent empty shell on every one of them would make
          the app look broken rather than look empty.
        */}
        {(imagesQuery.data ?? []).length > 0 ? (
          <View style={styles.gallerySection}>
            <GalleryStrip
              title="Event gallery"
              items={(imagesQuery.data ?? []).map((image) => ({
                id: image.id,
                url: image.url,
                caption: image.caption,
              }))}
            />
          </View>
        ) : null}

        {usesRoles && !alreadyApplied ? (
          <RolePicker
            roles={roles}
            selectedRoleId={selectedRoleId}
            onSelect={setSelectedRoleId}
            volunteerExperience={volunteerProfile?.experience_level ?? null}
            isVerified={isVerified}
          />
        ) : null}

        {/*
          Sits with the other things being decided before applying, above the
          action bar that acts on them — and renders nothing at all for a
          one-day outreach, which is every outreach until an organisation makes
          a longer one. Hidden once applied: the commitment is fixed at that
          point, and re-ticking boxes that change nothing would be a lie.
        */}
        {!alreadyApplied ? (
          <View style={styles.daysSection}>
            <DayCommitmentPicker
              days={days}
              outreach={outreach}
              selected={dayIdsForApplication}
              onChange={setCommittedDayIds}
              disabled={createApplication.isPending}
            />
          </View>
        ) : null}

        {alreadyApplied ? (
          <View style={styles.statusPanel}>
            <Badge
              label={application.type === 'quick_join' ? 'Quick Join' : 'Full Application'}
              tone="neutral"
            />
            <Text style={styles.statusText}>{STATUS_MESSAGE[application.status]}</Text>

            {/*
              The way out that used to not exist. Withdrawal is all-or-nothing
              and closes the moment the event begins, so a volunteer on four
              scattered Saturdays who could not make the third had two options:
              abandon the whole campaign, or not turn up and take a no-show.
            */}
            {canChangeDays ? (
              <Pressable
                onPress={() => setReleaseVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Change which days you are on"
                style={styles.changeDaysAction}
              >
                <MaterialCommunityIcons
                  name="calendar-edit"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.changeDaysText}>
                  {myCommittedDays.data
                    ? `You are on ${myCommittedDays.data.length} of ${days.length} days · change`
                    : 'Change my days'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {blockedByVerification && !alreadyApplied ? (
          <View style={styles.gate}>
            <MaterialCommunityIcons name="shield-alert-outline" size={20} color={colors.warning} />
            <View style={styles.gateText}>
              <Text style={styles.gateTitle}>Verification required</Text>
              {/*
                On a multi-role event the gate is raised by the ROLE that was
                tapped, so the copy has to name that role. Saying "this is a
                clinical outreach" contradicted the app one tap later, when
                choosing the support role on the same event let the volunteer
                straight through -- the event had not changed, only the role.
              */}
              <Text style={styles.gateBody}>
                {selectedRoleLabel
                  ? `The ${selectedRoleLabel} role is clinical, so you need a verified profile to apply for it. Any support roles on this outreach are open to you now.`
                  : 'This is a clinical outreach, so you need a verified profile before you can apply. Support-role events are open to you now.'}
              </Text>
              {/*
                A volunteer who has already sent a document is told so HERE,
                rather than being invited to start something they have finished.
                The wait is a human reading it, and saying that plainly is the
                difference between "we are working on it" and silence.
              */}
              {awaitingReview ? (
                <Text style={[styles.gateBody, styles.gateBodySecond]}>
                  Your document is with the V-HUB team. Applications to clinical roles open as soon
                  as it has been reviewed.
                </Text>
              ) : null}
              {/*
                THIS NOW GOES SOMEWHERE. It used to open a dialog saying
                verification "isn't open yet", which stopped being true when
                app/(volunteer)/verify-identity.tsx was built: a volunteer can
                sign the declaration and upload a credential document there
                today. Leaving the dead end in place meant the app turned
                someone away from a clinical outreach and then told them there
                was nothing they could do about it.

                It links to the VOLUNTEER-group screen, never (auth)/verify-identity.
                That one is a step of the onboarding wizard: it reads
                useOnboardingStore, which is reset() once onboarding finishes,
                and submitting it from outside the wizard wiped a volunteer's
                category, skills, specialties, availability, region and
                district -- and the now-null category made useAuthGuard drag
                them back through the whole thing.

                A volunteer whose documents are already in review is sent to the
                same screen rather than being given a decision they cannot act
                on: it is where their document, and its status, actually live.
              */}
              <Pressable
                onPress={() => router.push('/(volunteer)/verify-identity')}
                accessibilityRole="button"
                accessibilityLabel={
                  awaitingReview ? 'See your verification status' : 'Start identity verification'
                }
                style={styles.gateAction}
              >
                <Text style={styles.gateActionText}>
                  {awaitingReview ? 'See your verification status' : 'Get verified'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {createApplication.isError && !fullFormVisible ? (
          <Text style={styles.error}>
            {createApplication.error instanceof Error
              ? createApplication.error.message
              : 'Could not submit your application.'}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {canWithdraw ? (
          <Button
            title="Withdraw application"
            variant="outline"
            onPress={() => setWithdrawVisible(true)}
            accessibilityLabel="Withdraw application"
          />
        ) : outreach.status === 'cancelled' ? (
          // Checked BEFORE the application's own status: "you withdrew" or
          // "you're in" is not the thing a volunteer needs to read about an
          // event that is not happening.
          <Text style={styles.footerCancelled}>
            The organisation cancelled this event. You do not need to attend.
          </Text>
        ) : alreadyApplied ? (
          <Text style={styles.footerNote}>{STATUS_MESSAGE[application.status]}</Text>
        ) : outreach.status !== 'open' ? (
          <Text style={styles.footerNote}>This outreach is no longer accepting applications.</Text>
        ) : isFull ? (
          <Text style={styles.footerNote}>
            Every slot is filled. Check the feed for other outreaches.
          </Text>
        ) : (
          <View style={styles.actions}>
            {/*
              On a multi-role outreach nothing can be offered until a role is
              chosen: Quick Join versus Full Application is decided by the
              ROLE's clinical/support type, not the outreach's summary.
            */}
            {usesRoles && !selectedRole ? (
              <Text style={styles.footerNote}>Choose a role above to apply.</Text>
            ) : null}
            {(usesRoles ? selectedRole?.role_type === 'support' : !isClinical) ? (
              <Button
                title={createApplication.isPending ? 'Joining...' : 'Quick Join'}
                onPress={handleQuickJoin}
                disabled={createApplication.isPending || noDaysChosen}
                style={styles.actionButton}
                accessibilityLabel="Quick join this outreach"
              />
            ) : null}
            <Button
              title="Apply Now"
              variant={(usesRoles ? selectedRole?.role_type === 'clinical' : isClinical) ? 'solid' : 'outline'}
              onPress={() => setFullFormVisible(true)}
              disabled={
                blockedByVerification ||
                createApplication.isPending ||
                noDaysChosen ||
                (usesRoles && !selectedRole)
              }
              style={styles.actionButton}
              accessibilityLabel="Open the full application form"
            />
          </View>
        )}
      </View>

      <DayReleaseSheet
        visible={releaseVisible}
        days={days}
        outreach={outreach}
        committedDayIds={(myCommittedDays.data ?? []).map((day) => day.id)}
        recentLateReleases={lateReleaseCount.data ?? 0}
        busyDayId={releaseDay.isPending ? (releaseDay.variables?.outreachDayId ?? null) : null}
        errorMessage={
          releaseDay.isError
            ? releaseDay.error instanceof Error
              ? releaseDay.error.message
              : 'Could not change that day.'
            : null
        }
        onRelease={(outreachDayId) =>
          application &&
          releaseDay.mutate(
            {
              applicationId: application.id,
              outreachDayId,
              release: true,
              // outreach.id, not the route param: the param is string|undefined
              // and this is only reachable once the outreach has loaded.
              outreachId: outreach.id,
              // Lets the server be told who dropped the day. Everything that
              // decides the deduction is still read from the database.
              volunteerId,
            },
            {
              onSuccess: (result) => {
                /*
                  The sheet already warns BEFORE the tap that a day inside 24
                  hours counts as a late cancellation, but it cannot name a
                  figure — the amount depends on how many late releases are
                  already in the rolling window, which only the server knows.
                  This is where the number gets said.

                  Nothing is said when nothing was charged. "That cost you 0
                  points" reads as a punishment.
                */
                if (result.penalty) {
                  setToast(
                    `Day dropped. That cost ${Math.abs(result.penalty)} V-Score points` +
                      (result.newScore === null
                        ? '.'
                        : ` — your score is now ${Math.round(result.newScore)}.`)
                  );
                }
              },
            }
          )
        }
        onRecommit={(outreachDayId) =>
          application &&
          releaseDay.mutate({
            applicationId: application.id,
            outreachDayId,
            release: false,
            outreachId: outreach.id,
          })
        }
        onClose={() => {
          setReleaseVisible(false);
          releaseDay.reset();
        }}
      />

      <FullApplicationSheet
        visible={fullFormVisible}
        outreachTitle={outreach.title}
        matchingSkills={matchingSkills}
        missingSkills={missingSkills}
        isPending={createApplication.isPending}
        errorMessage={
          createApplication.isError
            ? createApplication.error instanceof Error
              ? createApplication.error.message
              : 'Could not submit your application.'
            : undefined
        }
        onSubmit={handleFullSubmit}
        onDismiss={() => setFullFormVisible(false)}
      />

      <WithdrawSheet
        visible={withdrawVisible}
        outreachTitle={outreach.title}
        eventDate={outreach.date}
        eventStartTime={outreach.start_time}
        isPending={cancelApplication.isPending}
        errorMessage={
          cancelApplication.isError
            ? cancelApplication.error instanceof Error
              ? cancelApplication.error.message
              : 'Could not withdraw your application.'
            : undefined
        }
        onConfirm={handleWithdraw}
        onDismiss={() => setWithdrawVisible(false)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} durationMs={6000} />
    </SafeAreaView>
  );
}

/**
 * One labelled fact in the outreach card.
 *
 * The icon sits on the label's own line: rendered at 16pt in a 16pt-wide
 * column, against a label whose line height is also 16, so the two boxes are
 * identical and share a line exactly. An earlier version put the icon in a
 * 28pt circular tile, which cannot sit on a 13pt line however it is aligned --
 * the tile's edges always overhang the text and it read as floating above.
 *
 * The column is fixed-width because glyphs differ in intrinsic width -- a pin
 * is narrow, a stethoscope wide -- so laid out bare they never share a left
 * edge and the text after them starts at a different x on every row.
 *
 * Rows are separated by the card's `gap` alone. No dividers.
 */
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconColumn}>
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={colors.primary}
          style={styles.detailIcon}
        />
      </View>
      <View style={styles.detailTextBlock}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailText}>{children}</Text>
      </View>
    </View>
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
    justifyContent: 'space-between',
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
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  /*
    The gallery sat flush against the skills note above it and the role picker
    below, so three unrelated blocks read as one. An empty gallery renders
    nothing at all, and an empty View with margins would leave a gap where the
    section is absent, so the wrapper is only rendered when there is actually
    something in it.
  */
  gallerySection: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  // Minimum height so the hero is the same size with or without a flyer, and
  // content bottom-aligned so the title sits over the darkest part of a
  // typical poster rather than floating in the middle of it.
  hero: {
    borderRadius: radius.lg,
    // Raised from 180. The banner is the first thing a volunteer sees and an
    // organisation's flyer was being reduced to a strip behind the title; this
    // gives roughly 16:10 on a common phone width, which is enough of the
    // image to be worth uploading.
    minHeight: 240,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroOrg: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.primary,
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.white,
  },
  // Tinted card: a lighter grey than `surface` so it reads as a grouped panel
  // rather than as an input field, with EditSectionCard's radius and hairline
  // border so it sits with the rest of the app. Depth comes from the internal
  // structure -- white icon tiles lifting off the tint, hairline dividers,
  // a label/value hierarchy -- not from a shadow; nothing else in this
  // codebase is raised.
  //
  // Rows are spaced by `gap` alone -- no dividers, no per-row padding -- so
  // the space between any two facts is one number.
  card: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.base,
  },
  detailRow: {
    flexDirection: 'row',
    // Top-aligned, so the icon anchors to the label line at the head of the
    // row. Centring stranded the pin beside line 2 of a two-line address.
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  // The rail. Glyphs do NOT all have the same advance width -- the calendar
  // and stethoscope are wider than the pin -- so a width + textAlign on the
  // glyph itself let the wide ones overhang their box to the left and the
  // column came out ragged. A layout container centres each glyph's box in a
  // fixed 20pt column instead, which is deterministic: same centre, and
  // therefore the same left edge, for every icon on the card. 20 rather than
  // 16 so the widest glyph fits inside the column instead of spilling out.
  detailIconColumn: {
    width: 20,
    alignItems: 'center',
  },
  // Line height matched to the label's, so icon and label share one line box
  // and read as one line. This is what keeps the pin beside "LOCATION".
  detailIcon: {
    lineHeight: 16,
  },
  detailTextBlock: {
    flex: 1,
  },
  // Set back in size and weight so the value leads and the label only names
  // it; at 11pt semiBold the two were competing for the same emphasis.
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
  orgLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    // On top of the card's gap, so the action stands clear of the last fact.
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  orgLinkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  chipMatched: {
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextMatched: {
    color: colors.success,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // Margins live here rather than inside DayCommitmentPicker's own card so the
  // section sits clear of the role picker above and the status panel below,
  // instead of being flush against either.
  daysSection: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  statusPanel: {
    marginTop: spacing.xl,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  // Given its own space inside the status panel rather than tucked under the
  // status line: it is an action, and an action jammed against a sentence reads
  // as part of the sentence.
  changeDaysAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  changeDaysText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  gate: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.base,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
  },
  gateText: {
    flex: 1,
  },
  gateTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  gateBody: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // A real paragraph break. The 2pt that separates the title from the first
  // line is a hairline, and two body paragraphs stacked on it read as one
  // run-on sentence.
  gateBodySecond: {
    marginTop: spacing.sm,
  },
  gateAction: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  gateActionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  error: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.base,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerCancelled: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  footerNote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
