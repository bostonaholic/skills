Add an `invoice.reopen` event. Its handler returns status `reopened` with the
event's `invoiceId`, it goes to the `billing` queue, and it needs a migration
that adds a `reopened_at` column to the `invoices` table.

Tests run with file access inside the repository only, and with no child
processes.
