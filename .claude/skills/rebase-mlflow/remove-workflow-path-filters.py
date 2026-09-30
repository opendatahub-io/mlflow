"""Remove path/path-ignore filters from GitHub Actions workflows.

Used during rebase CI validation to trigger all workflows regardless of
which files changed. The commit containing this change is disposable —
it lives only on the ci-check branch and is never merged.

Usage: python3 .claude/skills/rebase-mlflow/remove-workflow-path-filters.py
"""

import glob
import re
import sys

for wf in sorted(glob.glob(".github/workflows/*.yml")):
    with open(wf) as f:
        content = f.read()
    original = content
    content = re.sub(r"(\n    paths(?:-ignore)?:\n(?:      - .*\n)+)", "\n", content)
    if content != original:
        with open(wf, "w") as f:
            f.write(content)
        sys.stdout.write(f"  stripped path filters: {wf}\n")
