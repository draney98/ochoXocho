# Scripts Directory

This directory contains utility scripts for the project.

## bump-version.js

Automatically increments the patch version in `package.json`. Used by the git pre-commit hook.

### Usage

```bash
# Increment patch version
node scripts/bump-version.js

# Skip version bump
node scripts/bump-version.js --skip
```

### Behavior

- Reads the current version from `package.json`
- Increments the patch version (e.g., `1.1.2` → `1.1.3`)
- Writes the updated version back to `package.json`
- Logs the version change to the console

## Git Hooks

### Pre-commit Hook

The pre-commit hook automatically bumps the version before each commit.

**To skip version bump:**

1. **Environment variable** (recommended):
   ```bash
   SKIP_VERSION_BUMP=1 git commit -m "Your message"
   ```

2. **For multiple commits in a session:**
   ```bash
   export SKIP_VERSION_BUMP=1
   git commit -m "Message 1"
   git commit -m "Message 2"
   unset SKIP_VERSION_BUMP
   ```

### Installation

The hooks are located in `.git/hooks/`. To make them executable:

```bash
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/commit-msg
```

### How It Works

1. Before each commit, the pre-commit hook runs
2. It calls `scripts/bump-version.js` to increment the patch version
3. The updated `package.json` is automatically staged
4. The commit proceeds with the new version included

### Notes

- The version bump happens **before** the commit is created
- The updated `package.json` is automatically staged
- If version bump fails, the commit is aborted
- Multiple developers committing in parallel may cause merge conflicts (this is expected and should be resolved manually)
