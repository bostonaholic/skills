---
type: regex
target: last_message
pattern: '^\s*(?:#{1,6}\s|(?:here(?:''s| is| are)|short (?:version|answer)|tl;?dr|great question|good question)\b)|(?:let me know|happy to help|want me to|would you like|if you (?:tell|share|give|send) me|i can (?:also )?(?:give|help|provide|dig|go|expand|elaborate|tailor|sketch|walk)|in summary|to summarize|to sum up)[^\n]*\s*$'
flags: i
match: not_contains
---
