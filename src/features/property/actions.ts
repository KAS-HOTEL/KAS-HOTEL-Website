'use server';

import { revalidatePath } from 'next/cache';

/**
 * Cache invalidation after a property edit.
 *
 * <h2>Why the save itself is not a Server Action</h2>
 *
 * The same reason sign-in is not: the mutation needs the browser's CSRF cookie
 * and the `X-XSRF-TOKEN` header that `lib/api` pairs with it. A Server Action
 * would post from the Next server, which holds neither, so the guard would have
 * to be re-implemented — or, far more likely, quietly skipped.
 *
 * This action does one thing: tell Next that server-rendered pages holding the
 * old property must be re-fetched. Without it the list, the switcher and the
 * overview would keep serving the pre-edit copy from the router cache, and the
 * `version` they carry would be stale — so the *next* save would fail with a
 * conflict the Partner could not explain.
 */
export async function revalidateProperties(): Promise<void> {
  // The layout is included deliberately: the property switcher is rendered
  // there, and a rename must reach it too.
  revalidatePath('/partner', 'layout');
  revalidatePath('/en', 'page');
  revalidatePath('/vi', 'page');
  revalidatePath('/en/hotels', 'page');
  revalidatePath('/vi/hotels', 'page');
}

/**
 * Cache invalidation after an approval or a publish on the Admin board.
 *
 * <h2>Both consoles, because one decision moves both</h2>
 *
 * Approving a submission changes the property's lifecycle and empties a row
 * from the review queue; publishing changes the lifecycle again and bumps the
 * `version` every subsequent write has to send. All of that is rendered on the
 * Partner side too — the overview's status, the portfolio row, the switcher —
 * so revalidating only `/admin` would leave the Partner console serving a
 * pre-decision copy, with a stale `version` that makes the *next* save fail
 * with a conflict nobody can explain.
 */
export async function revalidatePublishing(): Promise<void> {
  revalidatePath('/admin', 'layout');
  revalidatePath('/partner', 'layout');
}
