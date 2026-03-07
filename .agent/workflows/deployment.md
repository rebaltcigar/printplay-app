---
description: Full release and deployment workflow for PrintPlay app.
---

# Release & Deployment Workflow

Follow these steps for every production release to ensure stability and synchronization.

## 1. Versioning & Documentation
- **Bump Version**: Update the `version` in `package.json`.
- **Update Changelog**: Summarize changes in `CHANGELOG.md` following the established format (Added, Changed, Fixed).
- **Roadmap Sync**: 
    - Review `ROADMAP.md`.
    - Move completed items from the "Planned" or "In Progress" sections to the "Release History" or mark them as completed.

## 2. Firebase Infrastructure Audit
Before deploying, check if the changes require new indexes or rules:
- **Indexes**: Audit `firestore.indexes.json`. If you added a new `orderBy` or multiple `where` clauses on a collection, add the compound index.
- **Rules**: Audit `firestore.rules` and `storage.rules`. Ensure new collections or fields are protected.
- **Deploy Config**:
    - `npx firebase deploy --only firestore,storage -P dev`
    - `npx firebase deploy --only firestore,storage -P prod`
    - *Note: If Storage is not enabled, initialization in the console may be required.*

## 3. Git Management
- **Main Branch Check**:
    - If currently on `main`: Verify all tests pass, then `git push origin main`.
    - If on a **Feature Branch**: 
        1. Push changes to the branch.
        2. Create/Merge PR to `main`.
        3. Switch to `main` and pull.
- **Cleanup**: Delete any lingering build logs (`build.log`, etc.) before the final push.

## 4. Post-Deployment
- **Next Step**: Ask the user: *"Should we create a new branch for the next update in the roadmap?"*
- **Verification**: Run `npm run build` locally one last time to ensure deployment artifacts are correct.
