#!/usr/bin/env node
/**
 * Version bump script for git pre-commit hook
 * Increments the patch version in package.json
 * 
 * Usage: node scripts/bump-version.js [--skip]
 * 
 * Options:
 *   --skip: Skip version bump (useful when commit message contains "skip version")
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to package.json (relative to project root)
const packageJsonPath = join(__dirname, '..', 'package.json');

/**
 * Parses a version string and returns major, minor, patch
 * @param {string} version - Version string in format "major.minor.patch"
 * @returns {Object} Object with major, minor, patch numbers
 */
function parseVersion(version) {
    const parts = version.split('.');
    if (parts.length !== 3) {
        throw new Error(`Invalid version format: ${version}. Expected format: major.minor.patch`);
    }
    return {
        major: parseInt(parts[0], 10),
        minor: parseInt(parts[1], 10),
        patch: parseInt(parts[2], 10)
    };
}

/**
 * Formats version numbers into version string
 * @param {number} major - Major version number
 * @param {number} minor - Minor version number
 * @param {number} patch - Patch version number
 * @returns {string} Version string in format "major.minor.patch"
 */
function formatVersion(major, minor, patch) {
    return `${major}.${minor}.${patch}`;
}

/**
 * Increments the patch version
 * @param {string} currentVersion - Current version string
 * @returns {string} New version string with incremented patch
 */
function incrementPatchVersion(currentVersion) {
    const { major, minor, patch } = parseVersion(currentVersion);
    const newPatch = patch + 1;
    return formatVersion(major, minor, newPatch);
}

/**
 * Main function to bump version in package.json
 * @param {boolean} skip - If true, skip the version bump
 */
function bumpVersion(skip = false) {
    try {
        // Read package.json
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        
        const currentVersion = packageJson.version;
        
        // Check if we should skip version bump
        if (skip) {
            console.log(`[VERSION] Skipping version bump (current: ${currentVersion})`);
            process.exit(0);
        }
        
        // Increment patch version
        const newVersion = incrementPatchVersion(currentVersion);
        
        // Update package.json
        packageJson.version = newVersion;
        
        // Write back to file with proper formatting (2 space indent)
        writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        
        // Log the version change
        console.log(`[VERSION] Bumped version: ${currentVersion} → ${newVersion}`);
        
        // Exit successfully
        process.exit(0);
    } catch (error) {
        console.error('[VERSION] Error bumping version:', error.message);
        process.exit(1);
    }
}

// Check command line arguments
const args = process.argv.slice(2);
const shouldSkip = args.includes('--skip') || args.includes('-s');

// Run the version bump
bumpVersion(shouldSkip);
