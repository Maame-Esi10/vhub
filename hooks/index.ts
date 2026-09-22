export { useAuthGuard } from './useAuthGuard';
export { useSignIn } from './useSignIn';
export { useSignUp } from './useSignUp';
export { useResendConfirmation } from './useResendConfirmation';
export { useConfirmSignUp } from './useConfirmSignUp';
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
  useCloseAccount,
} from './useAccountSecurity';
export type {
  ChangePasswordParams,
  ChangeLoginEmailParams,
  PasswordStrength,
} from './useAccountSecurity';
export { useRequestPasswordReset, useCompletePasswordReset } from './usePasswordReset';
export type { CompletePasswordResetParams } from './usePasswordReset';
export { useSignDeclaration } from './useSignDeclaration';
export { adminActionKeys, useAdminActions, useAdminActionsForTarget } from './useAdminActions';
export { documentUrlKeys, useDocumentUrl } from './useDocumentUrl';
export {
  orgVerificationKeys,
  useMyVerificationSubmission,
  useSubmitVerification,
  useVerificationQueue,
  useVerificationDetail,
  useDecideVerification,
} from './useOrganisationVerification';
export type {
  VerificationSubmission,
  VerificationQueueRow,
  DecideVerificationParams,
} from './useOrganisationVerification';
export {
  credentialReviewKeys,
  useCredentialQueue,
  useDecideCredential,
} from './useCredentialReview';
export type { CredentialQueueRow, DecideCredentialParams } from './useCredentialReview';
export {
  moderationKeys,
  useAccountSearch,
  useModeratedAccounts,
  useModerateAccount,
} from './useModeration';
export type { ModerationSearchRow, ModerateParams } from './useModeration';
export {
  disputeKeys,
  useMyDisputes,
  useRaiseDispute,
  useDisputeQueue,
  useDisputeEvidence,
  useResolveDispute,
} from './useDisputes';
export type {
  RaiseDisputeParams,
  DisputeQueueRow,
  DisputeEvidence,
  ResolveDisputeParams,
} from './useDisputes';
export { platformStatsKeys, usePlatformStats } from './usePlatformStats';
export type { PlatformStats, MonthlyNoShows } from './usePlatformStats';
export {
  vettedSourceKeys,
  useVettedSources,
  useAddVettedSource,
  useRemoveVettedSource,
} from './useVettedSources';
export type { VettedSource } from './useVettedSources';
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
  useSearchOutreaches,
  MIN_SEARCH_LENGTH,
  usePublicOrganisationOutreaches,
  useCreateOutreach,
  useSaveOutreach,
  useCompleteOrCancelOutreach,
  useDeleteOutreach,
  useUpdateOutreach,
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
  OutreachSearchFilters,
  OutreachSearchWindow,
  CreateOutreachParams,
  SaveOutreachParams,
  CompleteOrCancelParams,
  DeleteOutreachParams,
  UpdateOutreachParams,
  UpdateOutreachStatusParams,
} from './useOutreaches';
export {
  outreachImageKeys,
  MAX_GALLERY_IMAGES,
  useOutreachImages,
  useAddOutreachImages,
  useDeleteOutreachImage,
  useReorderOutreachImages,
  useOrganisationGallery,
} from './useOutreachImages';
export type {
  AddOutreachImagesParams,
  DeleteOutreachImageParams,
  ReorderOutreachImagesParams,
  OrganisationGalleryImage,
} from './useOutreachImages';
export {
  outreachRoleKeys,
  useOutreachRoles,
  useOutreachRolesForMany,
  useReplaceOutreachRoles,
} from './useOutreachRoles';
export type { RoleDraft, ReplaceOutreachRolesParams } from './useOutreachRoles';
export {
  outreachDayKeys,
  useOutreachDays,
  useOutreachDaysForMany,
  useDayCoverageForMany,
  useAddOutreachDays,
  useSetOutreachDayHours,
  useApplicationDays,
  useApplicationDaysForMany,
  useMyLateReleaseCount,
  useReleaseCommittedDay,
  useOutreachCommitments,
} from './useOutreachDays';
export type { AddOutreachDaysParams, CommittedDay, ReleaseDayParams } from './useOutreachDays';
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
  useOrganisationLogos,
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
export {
  scoreEventKeys,
  useMyScoreEvents,
  useAllScoreEvents,
  useVoidScoreEvent,
  SCORE_EVENT_LABELS,
} from './useScoreEvents';
export type { ScoreEventRow, AdminScoreEventRow, VoidScoreEventParams } from './useScoreEvents';
