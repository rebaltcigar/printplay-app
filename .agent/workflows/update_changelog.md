---
description: How to release a new version and update the changelog
---

# Updating CHANGELOG.md

1.  **Identify Changes**: Review the recent git commits or your recent task history to see what has been completed.
2.  **Determine Version**:
    *   **Major** (x.0.0): Breaking changes or massive rewrites.
    *   **Minor** (0.x.0): New features (e.g., new page, new workflow).
    *   **Patch** (0.0.x): Bug fixes, small tweaks.
3.  **Edit CHANGELOG.md**:
    *   Add a new header: `## [Version] - YYYY-MM-DD`
    *   Group changes under:
        *   `### Added` for new features.
        *   `### Changed` for changes in existing functionality.
        *   `### Deprecated` for soon-to-be removed features.
        *   `### Removed` for now removed features.
        *   `### Fixed` for any bug fixes.
        *   `### Security` in case of vulnerabilities.
4.  **Update Package.json**: Update the `version` field in `package.json` to match.
5.  **Commit**: Commit the changes with a message like `chore: bump version to x.y.z`.

> [!TIP]
> Always check `ROADMAP.md` to see if any completed items should be marked as done or moved to the Changelog.
