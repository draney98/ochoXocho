# Git Hooks Setup

This project includes git hooks to automatically bump the patch version on every commit.

## Installation

1. **Make the hooks executable:**

   ```bash
   chmod +x .git/hooks/pre-commit
   chmod +x .git/hooks/commit-msg
   ```

2. **Verify the hooks are set up:**

   ```bash
   ls -la .git/hooks/pre-commit
   ls -la .git/hooks/commit-msg
   ```

   Both files should show executable permissions (`-rwxr-xr-x`).

## How It Works

### Pre-commit Hook

The pre-commit hook runs **before** every commit and:

1. Reads the current version from `package.json`
2. Increments the patch version (e.g., `1.1.2` → `1.1.3`)
3. Writes the updated version back to `package.json`
4. Automatically stages `package.json` so it's included in the commit
5. Logs the version change to the console

### Skipping Version Bump

To skip the version bump for a specific commit, use the environment variable:

```bash
SKIP_VERSION_BUMP=1 git commit -m "Your commit message"
```

For multiple commits in a session:

```bash
export SKIP_VERSION_BUMP=1
git commit -m "Message 1"
git commit -m "Message 2"
# ... more commits ...
unset SKIP_VERSION_BUMP
```

## Testing

Test the version bump script manually:

```bash
# Test version bump (dry run - check what it would do)
node scripts/bump-version.js

# Test skip flag
node scripts/bump-version.js --skip
```

## Troubleshooting

### Hook not running

- Ensure the hook file is executable: `chmod +x .git/hooks/pre-commit`
- Check that you're in a git repository: `git rev-parse --git-dir`
- Verify the hook exists: `ls -la .git/hooks/pre-commit`

### Version bump not working

- Check Node.js is available: `node --version`
- Verify `package.json` exists in the project root
- Check the script path: `ls -la scripts/bump-version.js`

### Merge conflicts

If multiple developers commit in parallel, you may get merge conflicts in `package.json`. This is expected:

1. Resolve the conflict manually
2. Choose the higher version number
3. Continue with your merge/rebase

## Notes

- The version bump happens **before** the commit is created
- The updated `package.json` is automatically staged
- If the version bump fails, the commit is aborted
- The hook only increments the **patch** version (e.g., `1.1.2` → `1.1.3`)
- Major and minor versions are preserved
