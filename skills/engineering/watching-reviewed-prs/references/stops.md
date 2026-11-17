# Stop reports

Read this when the loop stops, including at the soft cap.

On the soft cap, name each item still pending or rejected, and offer the
by-hand options: argue it yourself, accept the author's position and resolve,
approve manually, or re-arm. The handoff carries the state-file path, so a
resumed watch keeps its verdicts, `reviewedHead`, and `cyclesUsed`.

At every stop and at the soft cap, list each tracked item with its verdict
and what it rests on: verified by the code (with its file and line),
accepted on the author's resolve, or outstanding with its unmet claim. A
fix claim no re-review has confirmed is outstanding, never verified.

At `Feedback settled`, say no approval was cast and no thread resolved, so
the user may approve and resolve by hand or re-arm asking for approval.

At every stop, report the cycles used and the write ledger (resolves,
rebuttals and where, reactions). After an approval the skill cast, add its
URL, the cited head SHA, the per-item verdicts, both SHAs when the head
drifted, and both counts for any shape whose tracked count changed. At
`Approved by hand`, add the approval URL from `newApproval`.
