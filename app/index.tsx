// Routing from this screen is owned entirely by useAuthGuard (see
// app/_layout.tsx): it decides between (auth)/welcome and the tab group
// that belongs to the signed-in role — (volunteer), (organisation) or
// (admin) — from the session and the profile. This screen
// renders nothing while that decision resolves.
export default function Index() {
  return null;
}
