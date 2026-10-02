# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "skills-ref @ git+https://github.com/agentskills/agentskills@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref",
# ]
# ///

import sys
from pathlib import Path

from skills_ref import validator

CLAUDE_CODE_FRONTMATTER_FIELDS = {"argument-hint"}
validator.ALLOWED_FIELDS |= CLAUDE_CODE_FRONTMATTER_FIELDS

skills_dir = Path(__file__).resolve().parent.parent / "skills"
failed = False
for skill in sorted(p for p in skills_dir.iterdir() if (p / "SKILL.md").is_file()):
    for error in validator.validate(skill):
        print(f"{skill.relative_to(skills_dir.parent)}: {error}")
        failed = True

sys.exit(1 if failed else 0)
