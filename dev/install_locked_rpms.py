#!/usr/bin/env python3
"""Download, checksum-verify, and install binary RPMs from rpms.lock.yaml.

Used by the Konflux-pinned python CI job so it installs the same RPM
closure as hermetic prefetch, rather than resolving names from live
UBI/EPEL metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import platform
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

ARCH_ALIASES = {"arm64": "aarch64", "amd64": "x86_64"}
EPEL_GPG_KEY = "https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-9"
DOWNLOAD_RETRIES = 3


def detect_arch() -> str:
    machine = platform.machine()
    return ARCH_ALIASES.get(machine, machine)


def packages_for_arch(lock_path: Path, arch: str) -> list[dict[str, str]]:
    packages: list[dict[str, str]] = []
    in_arch = False
    in_packages = False
    current: dict[str, str] | None = None

    def flush() -> None:
        nonlocal current
        if current is not None:
            packages.append(current)
            current = None

    with lock_path.open() as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if line.startswith("- arch:"):
                flush()
                in_arch = line.split(":", 1)[1].strip() == arch
                in_packages = False
                continue
            if not in_arch:
                continue
            stripped = line.strip()
            if stripped == "packages:":
                in_packages = True
                continue
            if stripped == "source:":
                flush()
                in_packages = False
                continue
            if not in_packages:
                continue
            if line.startswith("  - url:"):
                flush()
                current = {"url": line.split("url:", 1)[1].strip()}
            elif current is not None and ":" in stripped:
                key, value = stripped.split(":", 1)
                current[key.strip()] = value.strip()
        flush()

    if not packages:
        raise SystemExit(f"No binary packages for arch {arch} in {lock_path}")
    missing = [pkg.get("name", pkg.get("url", "?")) for pkg in packages if "url" not in pkg]
    if missing:
        raise SystemExit(f"Lockfile packages missing url: {missing}")
    return packages


def _download(url: str, dest: Path) -> None:
    last_error: Exception | None = None
    request = urllib.request.Request(url, headers={"User-Agent": "mlflow-install-locked-rpms"})
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response, dest.open("wb") as out:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            return
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if dest.exists():
                dest.unlink()
            if attempt == DOWNLOAD_RETRIES:
                break
    raise SystemExit(f"Failed to download {url}: {last_error}")


def _verify(pkg: dict[str, str], dest: Path) -> None:
    name = pkg.get("name", dest.name)
    expected_size = pkg.get("size")
    if expected_size is not None:
        actual_size = dest.stat().st_size
        if actual_size != int(expected_size):
            raise SystemExit(f"{name}: size {actual_size} != locked {expected_size}")
    checksum = pkg.get("checksum")
    if checksum is None:
        raise SystemExit(f"{name}: lockfile entry has no checksum")
    algo, _, digest = checksum.partition(":")
    if algo != "sha256" or not digest:
        raise SystemExit(f"{name}: unsupported checksum {checksum!r}")
    actual = hashlib.sha256(dest.read_bytes()).hexdigest()
    if actual != digest:
        raise SystemExit(f"{name}: sha256 {actual} != locked {digest}")


def _import_epel_gpg() -> None:
    subprocess.run(["rpm", "--import", EPEL_GPG_KEY], check=True)


def _install(rpm_paths: list[Path]) -> None:
    cmd = [
        "dnf",
        "install",
        "-y",
        "--setopt=install_weak_deps=0",
        "--setopt=tsflags=nodocs",
        "--disablerepo=*",
        *[str(path) for path in rpm_paths],
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lockfile", type=Path, help="Path to rpms.lock.yaml")
    parser.add_argument("--arch", default=detect_arch(), help="RPM architecture (default: host)")
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help="Directory to store RPMs (default: a temporary directory)",
    )
    parser.add_argument(
        "--no-install",
        action="store_true",
        help="Download and verify only; do not run dnf install",
    )
    args = parser.parse_args()

    packages = packages_for_arch(args.lockfile, args.arch)
    dest_dir = args.dest or Path(tempfile.mkdtemp(prefix="locked-rpms-"))
    dest_dir.mkdir(parents=True, exist_ok=True)

    rpm_paths: list[Path] = []
    needs_epel_key = False
    for pkg in packages:
        url = pkg["url"]
        filename = url.rsplit("/", 1)[-1]
        dest = dest_dir / filename
        print(f"Fetching {pkg.get('name', filename)}", flush=True)
        _download(url, dest)
        _verify(pkg, dest)
        rpm_paths.append(dest)
        if pkg.get("repoid", "").startswith("epel"):
            needs_epel_key = True

    print(f"Verified {len(rpm_paths)} RPMs for {args.arch}", flush=True)
    if args.no_install:
        print(dest_dir)
        return 0

    if needs_epel_key:
        _import_epel_gpg()
    _install(rpm_paths)
    return 0


if __name__ == "__main__":
    sys.exit(main())
