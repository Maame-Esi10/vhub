// Routing from this screen is owned entirely by useAuthGuard (see
// app/_layout.tsx): it decides between (auth)/welcome, (volunteer) tabs,
// and (organisation) tabs based on session + profile role. This screen
// renders nothing while that decision resolves.
export default function Index() {
  return null;
}
