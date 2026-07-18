#!/usr/bin/env python3
"""Print the CHANGELOG.md section for a given version, for use as GitHub Release
notes. Matches the Keep-a-Changelog heading `## [<version>]...` and emits every
line up to (but not including) the next `## ` heading.

Usage: ops/changelog-notes.py 0.2.0 [path/to/CHANGELOG.md]
Exit 0 with the section on stdout; exit 0 with a short fallback if not found
(a release should still publish even if the notes lookup misses)."""
import re
import sys


def section(changelog: str, version: str) -> str:
    lines = changelog.splitlines()
    # Accept "## [0.2.0]", "## [0.2.0] - 2026-07-18", tolerate a leading 'v'.
    v = version.lstrip("v")
    head = re.compile(r"^##\s*\[v?" + re.escape(v) + r"\]")
    out, capturing = [], False
    for line in lines:
        if head.match(line):
            capturing = True
            continue
        if capturing and re.match(r"^##\s", line):
            break
        if capturing:
            out.append(line)
    return "\n".join(out).strip()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: changelog-notes.py <version> [changelog]", file=sys.stderr)
        return 2
    version = sys.argv[1]
    path = sys.argv[2] if len(sys.argv) > 2 else "CHANGELOG.md"
    with open(path, encoding="utf-8") as f:
        body = section(f.read(), version)
    print(body if body else f"Release {version}. See CHANGELOG.md for details.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
