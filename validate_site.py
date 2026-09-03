#!/usr/bin/env python3
"""
GitHub Pages Static Site Validator

Checks a local static website directory for common GitHub Pages deployment issues:
- Missing CSS, JavaScript, image, media, and linked local files
- Root-absolute paths that can break on GitHub Project Pages
- Case-sensitivity mismatches between HTML references and real filenames
- Files located inside underscore-prefixed directories
- CSS @import and url(...) references
- JavaScript module script references
- Links that may point outside the deployable project folder

Usage:
    python validate_site.py
    python validate_site.py path/to/your/site
    python validate_site.py path/to/your/site --verbose
    python validate_site.py path/to/your/site --html-only
"""

from __future__ import annotations

import argparse
import html.parser
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlparse


IGNORED_PROTOCOLS = (
    "http://",
    "https://",
    "//",
    "mailto:",
    "tel:",
    "data:",
    "javascript:",
    "#",
)

ASSET_EXTENSIONS = {
    ".css",
    ".js",
    ".mjs",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".avif",
    ".ico",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".ogg",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".pdf",
    ".xml",
    ".webmanifest",
}

HTML_EXTENSIONS = {".html", ".htm"}
CSS_EXTENSIONS = {".css"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}

ANSI = {
    "reset": "\033[0m",
    "red": "\033[91m",
    "yellow": "\033[93m",
    "green": "\033[92m",
    "cyan": "\033[96m",
    "bold": "\033[1m",
}


@dataclass
class Finding:
    severity: str
    file: Path
    line: int
    reference: str
    message: str
    fix: str


@dataclass
class ValidationReport:
    root: Path
    findings: list[Finding] = field(default_factory=list)
    html_files_checked: int = 0
    css_files_checked: int = 0
    files_scanned: int = 0
    links_checked: int = 0

    def add(
        self,
        severity: str,
        file_path: Path,
        line: int,
        reference: str,
        message: str,
        fix: str,
    ) -> None:
        self.findings.append(
            Finding(
                severity=severity,
                file=file_path,
                line=line,
                reference=reference,
                message=message,
                fix=fix,
            )
        )


class SiteHTMLParser(html.parser.HTMLParser):
    """Extract local resource references from HTML safely."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[str, str, int, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        line = self.getpos()[0]

        if tag == "link":
            href = attributes.get("href")
            rel = (attributes.get("rel") or "").lower()
            if href and ("stylesheet" in rel or href.lower().endswith(".css")):
                self.references.append(("css", href, line, tag))

        elif tag == "script":
            src = attributes.get("src")
            if src:
                self.references.append(("js", src, line, tag))

        elif tag in {"img", "source", "video", "audio", "track", "iframe", "embed", "object"}:
            src = attributes.get("src") or attributes.get("data")
            if src:
                self.references.append(("asset", src, line, tag))

        elif tag == "a":
            href = attributes.get("href")
            if href:
                self.references.append(("link", href, line, tag))


def color(text: str, name: str) -> str:
    if not sys.stdout.isatty():
        return text
    return f"{ANSI[name]}{text}{ANSI['reset']}"


def normalise_reference(reference: str) -> str:
    """Remove query strings, fragments, URL encoding, and surrounding whitespace."""
    value = unquote(reference.strip())
    parsed = urlparse(value)
    return parsed.path


def is_external_or_special(reference: str) -> bool:
    value = reference.strip().lower()
    return not value or value.startswith(IGNORED_PROTOCOLS)


def is_localhost_url(reference: str) -> bool:
    try:
        parsed = urlparse(reference)
        return parsed.hostname in LOCAL_HOSTS
    except ValueError:
        return False


def build_case_insensitive_map(root: Path) -> dict[str, Path]:
    """
    Create a lower-case relative-path map.

    This allows detection of paths such as:
    - HTML reference: styles.css
    - Actual file: Styles.css

    That may work on Windows but fail on GitHub Pages.
    """
    file_map: dict[str, Path] = {}

    for path in root.rglob("*"):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            file_map[relative.lower()] = path

    return file_map


def contains_underscore_directory(path: Path, root: Path) -> Path | None:
    """Return the first underscore-prefixed directory found in a relative path."""
    try:
        relative_parts = path.relative_to(root).parts
    except ValueError:
        return None

    for part in relative_parts[:-1]:
        if part.startswith("_"):
            return root / part

    return None


def find_case_difference(
    expected: Path,
    root: Path,
    file_map: dict[str, Path],
) -> Path | None:
    """Find an existing file whose path matches only when lower-cased."""
    try:
        relative = expected.relative_to(root).as_posix()
    except ValueError:
        return None

    actual = file_map.get(relative.lower())
    if actual and actual != expected:
        return actual

    return None


def get_reference_target(source_file: Path, root: Path, reference: str) -> tuple[Path | None, str]:
    """
    Resolve a local HTML/CSS reference.

    Returns:
        target: resolved local file path or None for external/special links
        path_type: relative, root-absolute, external, or invalid
    """
    cleaned = normalise_reference(reference)

    if is_external_or_special(reference):
        return None, "external"

    if is_localhost_url(reference):
        return None, "external"

    parsed = urlparse(reference)

    if parsed.scheme and parsed.scheme not in {"file"}:
        return None, "external"

    if not cleaned:
        return None, "external"

    if cleaned.startswith("/"):
        return root / cleaned.lstrip("/"), "root-absolute"

    return source_file.parent / cleaned, "relative"


def link_should_be_checked(reference: str) -> bool:
    """
    Only check likely local file links.

    Same-page anchors, external URLs, mailto, tel, and JavaScript URLs are excluded.
    """
    cleaned = normalise_reference(reference)

    if is_external_or_special(reference):
        return False

    if cleaned.endswith("/"):
        return False

    suffix = Path(cleaned).suffix.lower()
    return suffix in ASSET_EXTENSIONS or suffix in HTML_EXTENSIONS


def scan_html_file(
    html_file: Path,
    root: Path,
    report: ValidationReport,
    file_map: dict[str, Path],
) -> set[Path]:
    """Validate CSS, JS, media, and local page links found in an HTML file."""
    css_to_scan: set[Path] = set()

    try:
        content = html_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = html_file.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        report.add(
            "ERROR",
            html_file,
            0,
            "",
            f"Could not read HTML file: {error}",
            "Check file permissions and ensure the file is valid UTF-8 text.",
        )
        return css_to_scan

    parser = SiteHTMLParser()
    parser.feed(content)
    parser.close()

    if not parser.references:
        report.add(
            "INFO",
            html_file,
            0,
            "",
            "No local CSS, JS, asset, or page references were found.",
            "If this page should use styling or scripts, ensure it contains a <link> or <script src> reference.",
        )

    for reference_type, reference, line, tag in parser.references:
        if reference_type == "link" and not link_should_be_checked(reference):
            continue

        if is_external_or_special(reference):
            continue

        report.links_checked += 1
        target, path_type = get_reference_target(html_file, root, reference)

        if path_type == "root-absolute":
            report.add(
                "WARNING",
                html_file,
                line,
                reference,
                f"Root-absolute path found in <{tag}>: '{reference}'.",
                (
                    "GitHub Project Pages serve sites under a repository path such as "
                    "'/REPOSITORY-NAME/'. Use a relative path like './styles.css' or "
                    "'assets/styles.css', unless this is a user/organization root site."
                ),
            )

        if target is None:
            continue

        try:
            target_relative = target.resolve().relative_to(root.resolve())
        except ValueError:
            report.add(
                "ERROR",
                html_file,
                line,
                reference,
                "Reference resolves outside the website directory.",
                "Move the referenced file into the project folder and use a relative path such as './styles.css'.",
            )
            continue

        actual_target = root / target_relative

        if actual_target.exists():
            underscore_dir = contains_underscore_directory(actual_target, root)
            if underscore_dir:
                report.add(
                    "WARNING",
                    html_file,
                    line,
                    reference,
                    f"Referenced file is inside underscore-prefixed directory '{underscore_dir.name}'.",
                    (
                        "GitHub Pages/Jekyll may treat underscore directories as special and may not publish them. "
                        "Rename the folder to remove the leading underscore, for example '_assets' to 'assets'."
                    ),
                )

            if reference_type == "css" and actual_target.suffix.lower() in CSS_EXTENSIONS:
                css_to_scan.add(actual_target)

            continue

        case_match = find_case_difference(actual_target, root, file_map)
        if case_match:
            correct_path = case_match.relative_to(root).as_posix()
            report.add(
                "ERROR",
                html_file,
                line,
                reference,
                "Case-sensitivity mismatch: the referenced filename does not exactly match the real filename.",
                (
                    f"Change the HTML reference to '{correct_path}', or rename the file so it exactly matches "
                    f"'{Path(normalise_reference(reference)).name}'. GitHub Pages uses case-sensitive paths."
                ),
            )
        else:
            report.add(
                "ERROR",
                html_file,
                line,
                reference,
                f"Broken {reference_type.upper()} reference: file does not exist.",
                (
                    f"Create the missing file at '{actual_target.relative_to(root)}', "
                    f"or correct the path in the <{tag}> tag. For files beside index.html, use './filename.ext'."
                ),
            )

    return css_to_scan


def extract_css_references(content: str) -> list[tuple[str, int]]:
    """Find @import and url(...) local references in CSS."""
    references: list[tuple[str, int]] = []

    import_pattern = re.compile(
        r"""@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?""",
        re.IGNORECASE,
    )
    url_pattern = re.compile(
        r"""url\(\s*["']?([^"')\s]+)["']?\s*\)""",
        re.IGNORECASE,
    )

    for match in import_pattern.finditer(content):
        line = content.count("\n", 0, match.start()) + 1
        references.append((match.group(1), line))

    for match in url_pattern.finditer(content):
        line = content.count("\n", 0, match.start()) + 1
        references.append((match.group(1), line))

    return references


def scan_css_file(
    css_file: Path,
    root: Path,
    report: ValidationReport,
    file_map: dict[str, Path],
) -> None:
    """Validate local CSS imports and url(...) assets."""
    report.css_files_checked += 1

    try:
        content = css_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = css_file.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        report.add(
            "ERROR",
            css_file,
            0,
            "",
            f"Could not read CSS file: {error}",
            "Check file permissions and ensure the stylesheet is readable.",
        )
        return

    for reference, line in extract_css_references(content):
        if is_external_or_special(reference):
            continue

        report.links_checked += 1
        target, path_type = get_reference_target(css_file, root, reference)

        if path_type == "root-absolute":
            report.add(
                "WARNING",
                css_file,
                line,
                reference,
                f"Root-absolute CSS asset path found: '{reference}'.",
                (
                    "This can break on GitHub Project Pages. Use a relative path from the CSS file, "
                    "such as '../images/logo.png' or './fonts/font.woff2'."
                ),
            )

        if target is None:
            continue

        try:
            target_relative = target.resolve().relative_to(root.resolve())
        except ValueError:
            report.add(
                "ERROR",
                css_file,
                line,
                reference,
                "CSS asset reference resolves outside the website directory.",
                "Move the file into your project and correct the CSS url(...) path.",
            )
            continue

        actual_target = root / target_relative

        if actual_target.exists():
            underscore_dir = contains_underscore_directory(actual_target, root)
            if underscore_dir:
                report.add(
                    "WARNING",
                    css_file,
                    line,
                    reference,
                    f"CSS asset is inside underscore-prefixed directory '{underscore_dir.name}'.",
                    "Rename the directory without the underscore to ensure GitHub Pages publishes it.",
                )
            continue

        case_match = find_case_difference(actual_target, root, file_map)
        if case_match:
            report.add(
                "ERROR",
                css_file,
                line,
                reference,
                "Case-sensitivity mismatch in CSS asset reference.",
                (
                    f"Use the exact filename and capitalization: "
                    f"'{case_match.relative_to(root).as_posix()}'."
                ),
            )
        else:
            report.add(
                "ERROR",
                css_file,
                line,
                reference,
                "Broken CSS @import or url(...) asset reference.",
                (
                    f"Create '{actual_target.relative_to(root)}' or correct the path. "
                    "Remember that GitHub Pages file paths are case-sensitive."
                ),
            )


def scan_underscore_directories(root: Path, report: ValidationReport) -> None:
    """Flag all files located inside underscore-prefixed directories."""
    reported_paths: set[Path] = set()

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        underscore_dir = contains_underscore_directory(path, root)
        if underscore_dir and underscore_dir not in reported_paths:
            reported_paths.add(underscore_dir)
            report.add(
                "WARNING",
                underscore_dir,
                0,
                "",
                f"Underscore-prefixed directory detected: '{underscore_dir.relative_to(root)}'.",
                (
                    "GitHub Pages uses Jekyll by default and directories beginning with '_' can be treated as special "
                    "or excluded. Rename it, for example '_css' to 'css' or '_assets' to 'assets'."
                ),
            )


def print_report(report: ValidationReport, verbose: bool) -> int:
    """Print findings and return an appropriate exit code."""
    errors = [item for item in report.findings if item.severity == "ERROR"]
    warnings = [item for item in report.findings if item.severity == "WARNING"]
    infos = [item for item in report.findings if item.severity == "INFO"]

    print()
    print(color("GitHub Pages Site Validation Report", "bold"))
    print("=" * 42)
    print(f"Website directory: {report.root}")
    print(f"Files scanned:     {report.files_scanned}")
    print(f"HTML files:        {report.html_files_checked}")
    print(f"CSS files:         {report.css_files_checked}")
    print(f"References checked:{report.links_checked}")
    print()

    if not report.findings:
        print(color("PASS: No common GitHub Pages deployment issues were found.", "green"))
        print("Your CSS/JS references, filenames, and scanned local assets appear valid.")
        return 0

    severity_colors = {
        "ERROR": "red",
        "WARNING": "yellow",
        "INFO": "cyan",
    }

    for index, item in enumerate(report.findings, start=1):
        color_name = severity_colors.get(item.severity, "cyan")
        heading = color(f"[{item.severity}] #{index}", color_name)
        location = item.file.relative_to(report.root) if item.file.is_relative_to(report.root) else item.file

        print(f"{heading} {location}", end="")
        if item.line:
            print(f":{item.line}")
        else:
            print()

        if item.reference:
            print(f"  Reference: {item.reference}")

        print(f"  Problem:   {item.message}")
        print(f"  Fix:       {item.fix}")
        print()

    print("=" * 42)
    print(
        f"Results: {color(str(len(errors)) + ' error(s)', 'red')}, "
        f"{color(str(len(warnings)) + ' warning(s)', 'yellow')}, "
        f"{color(str(len(infos)) + ' info message(s)', 'cyan')}"
    )

    if errors:
        print(color("FAIL: Fix errors before pushing to GitHub Pages.", "red"))
        return 1

    print(color("PASS WITH WARNINGS: Review warnings before deploying.", "yellow"))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a static website directory for common GitHub Pages deployment issues."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Website directory to scan. Defaults to the current folder.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print extra scan information.",
    )
    parser.add_argument(
        "--html-only",
        action="store_true",
        help="Skip CSS @import and CSS url(...) validation.",
    )
    args = parser.parse_args()

    root = Path(args.directory).expanduser().resolve()

    if not root.exists():
        print(color(f"Error: Directory does not exist: {root}", "red"))
        return 2

    if not root.is_dir():
        print(color(f"Error: Path is not a directory: {root}", "red"))
        return 2

    report = ValidationReport(root=root)
    all_files = [path for path in root.rglob("*") if path.is_file()]
    report.files_scanned = len(all_files)

    html_files = [path for path in all_files if path.suffix.lower() in HTML_EXTENSIONS]
    report.html_files_checked = len(html_files)

    if args.verbose:
        print(f"Scanning {root}")
        print(f"Found {len(html_files)} HTML file(s) and {len(all_files)} total file(s).")

    if not html_files:
        report.add(
            "ERROR",
            root,
            0,
            "",
            "No HTML files were found in the selected directory.",
            "Make sure index.html is inside the GitHub Pages publish folder.",
        )

    file_map = build_case_insensitive_map(root)
    scan_underscore_directories(root, report)

    css_files_from_html: set[Path] = set()

    for html_file in html_files:
        css_files_from_html.update(scan_html_file(html_file, root, report, file_map))

    if not args.html_only:
        for css_file in css_files_from_html:
            scan_css_file(css_file, root, report, file_map)

    return print_report(report, args.verbose)


if __name__ == "__main__":
    raise SystemExit(main())