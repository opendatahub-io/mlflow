"""Validate GitHub Actions workflow and action files.

Complements `.github/policy.rego` with checks that need cross-file or remote
context.
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import yaml

# Matches a `uses:` line that references a remote action (not a local `./` path).
# Captures:  owner/repo[/subpath]  @  ref  [  # comment  ]
_USES_RE = re.compile(
    r"""
    ^\s*-?\s*uses:\s+          # leading `- uses:` or `uses:`
    (?P<action>[^@\s]+)        # owner/repo[/subpath]
    @
    (?P<ref>[^\s#]+)           # ref (SHA, tag, or branch)
    (?:\s+\#\s*(?P<comment>\S+))?  # optional  # comment
    """,
    re.VERBOSE,
)

# A full 40-character hexadecimal SHA.
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")

# Requires at least vMAJOR.MINOR.PATCH to avoid ambiguous moving tags like v4.
_VERSION_COMMENT_RE = re.compile(r"^v\d+\.\d+\.\d+(?:\.\d+)*$")

_CACHE_PATH = Path(".cache/action-pins.json")

# Downstream-only workflow, excluded here since it's globbed directly and
# ignores the top-level `exclude` in .pre-commit-config.yaml.
_EXCLUDED_FILES = {Path(".github/workflows/post-codefreeze-gatekeeper.yaml")}
