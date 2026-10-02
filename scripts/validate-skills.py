# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "skills-ref @ git+https://github.com/agentskills/agentskills@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref",
# ]
# ///

import sys
from pathlib import Path

from skills_ref import validator

CLAUDE_CODE_FRONTMATTER_FIELDS = {"argument-hint", "disable-model-invocation", "effort"}
validator.ALLOWED_FIELDS |= CLAUDE_CODE_FRONTMATTER_FIELDS

skills_dir = (Path(__file__).resolve().parent.parent / "skills").resolve()
failed = False
if not sys.argv[1:]:
    sys.exit("usage: validate-skills.py <skill/SKILL.md> [<skill/SKILL.md> ...]")

for path in sys.argv[1:]:
    skill_file = Path(path).resolve()
    skill = skill_file.parent
    if (
        skill_file.name != "SKILL.md"
        or skill.parent.parent != skills_dir
        or skill.parent.name not in {"engineering", "productivity"}
        or not skill_file.is_file()
    ):
        sys.exit(f"invalid active skill path: {path}")
    for error in validator.validate(skill):
        print(f"{skill.relative_to(skills_dir.parent)}: {error}")
        failed = True

sys.exit(1 if failed else 0)
