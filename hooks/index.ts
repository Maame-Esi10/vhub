export { useAuthGuard } from './useAuthGuard';
export { useSignIn } from './useSignIn';
export { useSignUp } from './useSignUp';
export type { SignUpParams, SignUpResult } from './useSignUp';
export { useCompleteOnboarding } from './useCompleteOnboarding';
export { useSignOut } from './useSignOut';
export { usePushRegistration } from './usePushRegistration';
export {
  useChangePassword,
  useChangeLoginEmail,
  useCancelEmailChange,
  syncProfileEmail,
  passwordStrength,
  MIN_PASSWORD_LENGTH,
} from './useAccountSecurity';
export type {
  ChangePasswordParams,
  ChangeLoginEmailParams,
  PasswordStrength,
} from './useAccountSecurity';
export { useSignDeclaration } from './useSignDeclaration';
export {
  notificationKeys,
  useNotifications,
  useMarkNotificationsRead,
  filterNotifications,
  unreadCount,
} from './useNotifications';
export type {
  AppNotification,
  NotificationFilter,
  NotificationType,
} from './useNotifications';
export {
  outreachKeys,
  useOrganisationOutreaches,
  useOutreach,
  useOpenOutreaches,
  useRankedFeed,
  usePublicOrganisationOutreaches,
  useCreateOutreach,
  useUpdateOutreachStatus,
} from './useOutreaches';
export type {
  ApplicantCounts,
  OutreachWithCounts,
  OutreachOrganisation,
  OutreachWithOrganisation,
  RankedFeed,
  RankedFeedItem,
  FeedFilters,
  CreateOutreachParams,
  UpdateOutreachStatusParams,
} from './useOutreaches';
export {
  outreachRoleKeys,
  useOutreachRoles,
  useReplaceOutreachRoles,
} from './useOutreachRoles';
export type { RoleDraft, ReplaceOutreachRolesParams } from './useOutreachRoles';
export {
  applicationKeys,
  useOutreachApplications,
  useUpdateApplicationStatus,
  useBatchDecideApplications,
  useVolunteerApplications,
  useMyApplicationForOutreach,
  useMyWaitlistPositions,
  useCreateApplication,
  useCancelApplication,
} from './useApplications';
export type {
  ApplicantProfile,
  ApplicantVolunteer,
  ApplicationWithVolunteer,
  OrganisationApplicationDecision,
  UpdateApplicationStatusParams,
  BatchDecideParams,
  VolunteerApplication,
  CreateApplicationParams,
  CancelApplicationParams,
} from './useApplications';
// useAttendance is deliberately NOT exported here. It imports lib/geolocation,
// which imports expo-location — a NATIVE module — and this barrel is imported
// by app/_layout.tsx, so a re-export evaluates expo-location on EVERY route.
// On a dev client built before that module was added, the import throws at
// module scope and every screen in the app loses its default export, not just
// the attendance ones. Import it directly:
// `import { useCheckIn } from '@/hooks/useAttendance';`
// Same rule as DateTimeField and useMediaUpload — see components/ui/index.ts.
export { eventReviewKeys, useOutreachReviews, useSubmitEventReview } from './useEventReviews';
export { feedbackKeys, useMyReviews, useVolunteerReviewSummary } from './useVolunteerFeedback';
export type { MyEventReview } from './useVolunteerFeedback';
export type { SubmitEventReviewParams } from './useEventReviews';
export {
  publicProfileKeys,
  usePublicVolunteerProfile,
  usePublicOrganisationProfile,
} from './usePublicProfiles';
export {
  profileEditorKeys,
  useMyOrganisationProfile,
  useUpdateVolunteerProfile,
  useUpdateOrganisationProfile,
} from './useProfileEditor';
export type {
  UpdateVolunteerProfileParams,
  UpdateOrganisationProfileParams,
} from './useProfileEditor';
