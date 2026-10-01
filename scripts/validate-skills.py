"""Validate every skill in skills/ against the Agent Skills spec (agentskills.io).

Usage: uv run scripts/validate-skills.py
"""

# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "skills-ref @ git+https://github.com/agentskills/agentskills@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref",
# ]
# ///

import sys
from pathlib import Path

from skills_ref import validator

# Claude Code frontmatter extensions used by skills in this repo.
validator.ALLOWED_FIELDS |= {"argument-hint"}

skills_dir = Path(__file__).resolve().parent.parent / "skills"
failed = False
for skill in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
    for error in validator.validate(skill):
        print(f"{skill.relative_to(skills_dir.parent)}: {error}")
        failed = True

sys.exit(1 if failed else 0)
