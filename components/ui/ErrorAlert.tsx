import { useState } from 'react';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { humanError } from '@/lib/errorMessage';

export interface ErrorAlertProps {
  /**
   * The failure to announce. A React Query mutation's `error`, or any thrown
   * value. Null or undefined shows nothing.
   */
  error: unknown;
  /** Sentence shown when the error itself has nothing a person can read. */
  fallback?: string;
  /** Overrides the default heading. */
  title?: string;
}

/**
 * The one way an ACTION FAILURE is shown to a user.
 *
 * WHY THIS EXISTS (owner, 2026-09-21 and again 2026-09-22, emphatically).
 * Failures were being rendered into the page as a line of red text underneath
 * the submit button. That put them at the very bottom of a scrolling screen --
 * frequently below the fold at the instant they were written, and underneath
 * the floating tab pill when they were not. A volunteer whose suspended account
 * was refused an application saw a button that appeared to do nothing, because
 * the sentence explaining the refusal was printed somewhere they were not
 * looking. "Nothing happened" is the worst thing an app can say, and a message
 * nobody reads is indistinguishable from no message.
 *
 * A failure is not a toast either. A toast is a receipt for something that
 * worked and takes itself away; a refusal has to be read, so it stops the
 * person and asks them to acknowledge it. That is AlertDialog, the same
 * mechanism as the Sign Out confirmation.
 *
 * WHAT THIS IS NOT FOR. Field-level validation ("Enter a valid phone number"
 * under the phone box) stays inline: it is attached to the control it is about
 * and the person is already looking at it. This is for the result of pressing
 * a button.
 *
 * DISMISSAL IS DERIVED, NOT AN EFFECT. The dismissed error is remembered by
 * identity, so a NEW failure -- React Query builds a fresh error object per
 * attempt -- reopens the dialog, while the one just acknowledged stays shut.
 * Doing this with an effect would mean another `set-state-in-effect`
 * suppression for no benefit.
 */
export function ErrorAlert({ error, fallback, title = 'That did not work' }: ErrorAlertProps) {
  const [dismissed, setDismissed] = useState<unknown>(null);

  const visible = Boolean(error) && error !== dismissed;

  return (
    <AlertDialog
      visible={visible}
      tone="error"
      title={title}
      message={humanError(error, fallback)}
      onDismiss={() => setDismissed(error)}
    />
  );
}
