"""Verify that an MLflow rebase preserves the existing ODH workflow policy.

Usage:
    python3 .claude/skills/rebase-mlflow/audit-workflow-policy.py \
        <pre-rebase-odh-ref> <old-upstream-ref>

The audit derives policy from Git history instead of maintaining a separate
allowlist or denylist in this skill.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

WORKFLOW_DIRECTORY = ".github/workflows"
WORKFLOW_SUFFIXES = (".yml", ".yaml")


def git_lines(*args: str) -> set[str]:
    result = subprocess.run(
        ["git", *args],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return set(result.stdout.splitlines())


def git_text(ref: str, path: str) -> str:
    result = subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return result.stdout


def github_paths(ref: str | None = None) -> set[str]:
    if ref is None:
        return {path for path in git_lines("ls-files", ".github") if Path(path).exists()}
    return git_lines("ls-tree", "-r", "--name-only", ref, "--", ".github")


def workflow_paths(paths: set[str]) -> set[str]:
    prefix = f"{WORKFLOW_DIRECTORY}/"
    return {path for path in paths if path.startswith(prefix) and path.endswith(WORKFLOW_SUFFIXES)}


def workflow_jobs(content: str) -> set[str]:
    jobs: set[str] = set()
    in_jobs = False
    for line in content.splitlines():
        if line == "jobs:":
            in_jobs = True
            continue
        if in_jobs and (match := re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)):
            jobs.add(match.group(1))
    return jobs


def workflow_references(content: str) -> set[str]:
    return set(re.findall(r"\.github/workflows/[A-Za-z0-9._/-]+", content))


def format_paths(heading: str, paths: set[str]) -> str:
    return heading + ":\n  " + "\n  ".join(sorted(paths))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "baseline_ref",
        help="ODH master ref captured before the rebase (for example, $SQUASH_BASE)",
    )
    parser.add_argument(
        "upstream_base_ref",
        help=(
            "old upstream release ref on which baseline_ref was based "
            "(for example, $CURRENT_VERSION)"
        ),
    )
    args = parser.parse_args()

    current_paths = github_paths()
    baseline_paths = github_paths(args.baseline_ref)
    upstream_base_paths = github_paths(args.upstream_base_ref)
    current_workflows = workflow_paths(current_paths)
    baseline_workflows = workflow_paths(baseline_paths)
    upstream_base_workflows = workflow_paths(upstream_base_paths)

    errors: list[str] = []

    if restored_paths := current_paths & (upstream_base_paths - baseline_paths):
        errors.append(
            format_paths("Downstream-deleted .github paths restored by the rebase", restored_paths)
        )

    if new_workflows := current_workflows - baseline_workflows:
        errors.append(
            format_paths(
                "Workflows not present on pre-rebase ODH master require explicit review",
                new_workflows,
            )
        )

    common_workflows = current_workflows & baseline_workflows & upstream_base_workflows
    for path in sorted(common_workflows):
        current_content = Path(path).read_text()
        baseline_content = git_text(args.baseline_ref, path)
        upstream_base_content = git_text(args.upstream_base_ref, path)

        restored_jobs = workflow_jobs(current_content) & (
            workflow_jobs(upstream_base_content) - workflow_jobs(baseline_content)
        )
        if restored_jobs:
            errors.append(
                format_paths(f"Downstream-removed jobs restored in {path}", restored_jobs)
            )

        restored_references = workflow_references(current_content) & (
            workflow_references(upstream_base_content) - workflow_references(baseline_content)
        )
        if restored_references:
            errors.append(
                format_paths(
                    f"Downstream-removed workflow references restored in {path}",
                    restored_references,
                )
            )

    if errors:
        sys.stderr.write("ODH workflow policy audit failed:\n\n" + "\n\n".join(errors) + "\n")
        return 1

    sys.stdout.write("ODH workflow policy audit passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
