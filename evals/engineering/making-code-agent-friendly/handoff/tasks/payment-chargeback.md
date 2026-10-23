Add a `payment.chargeback` event. Its handler returns status `charged_back`
with the event's `invoiceId`, it goes to the `payments` queue, and it needs a
migration that adds a `charged_back_at` column to the `payments` table.

Tests run with file access inside the repository only, and with no child
processes.
