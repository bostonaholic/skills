# Decision log example

From a checkout app. Each fix comes first, then the problems it removes.

## Fix 1: one `Dialog` that owns focus

Every dialog restores focus to the element that opened it, so no dialog needs
its own focus code.

- `ui/LogoutDialog.tsx:30` waits 100 ms before focusing the menu button.
- `ui/DeleteDialog.tsx:44` stores the opener in a module global.
- `ui/ShareDialog.tsx:12` takes a `focusAfterClose` prop only `Toolbar` passes.

## Fix 2: a `PaymentProvider` interface

Checkout calls one interface; each provider implements it.

- `checkout/submit.ts:88` branches on `provider === "paypal"`.
- `checkout/receipt.ts:20` copies the fee rounding from `checkout/submit.ts:61`.
- `payments/stripe.ts:140` swallows the error from `createIntent`.

## Fix 3: move undo next to the commands it reverses

Undo lived in `state/history.ts`, far from the commands, and each command
change needed a matching edit there.

- `state/history.ts:55` switches on every command name.
- `commands/rename.ts` and `state/history.ts` changed together in 14 of the
  last 20 commits that touched either.

## Left alone

- `legacy/export.ts:200` retries three times. The partner API documents
  intermittent 503s, so the retry is a fact about the outside world.
