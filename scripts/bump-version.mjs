#!/usr/bin/env node

/**
 * Bump version of all packages in the workspace.
 *
 * Usage: node scripts/bump-version.mjs [patch|minor|major]
 * Default: patch
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const args = process.argv.slice(2);
const type = args[0] || 'patch'; // patch, minor, major

if (!['patch', 'minor', 'major'].includes(type) && !/^\d+\.\d+\.\d+$/.test(type)) {
	console.error('Invalid bump type. Use: patch, minor, major, or a specific version (x.y.z)');
	process.exit(1);
}

// Find all package.json files
function findPackageJsons(dir) {
	const results = [];
	try {
		const items = readdirSync(dir);

		for (const item of items) {
			if (item === 'node_modules' || item.startsWith('.')) continue;

			const fullPath = join(dir, item);
			const stat = statSync(fullPath);

			// Skip template directories
			if (fullPath.includes('/template/templates/')) continue;

			if (stat.isDirectory()) {
				results.push(...findPackageJsons(fullPath));
			} else if (item === 'package.json') {
				results.push(fullPath);
			}
		}
	} catch (error) {
		// Ignore errors if directory doesn't exist
	}

	return results;
}

function bumpVersion(version, type) {
	// If type is a specific version, return it
	if (/^\d+\.\d+\.\d+$/.test(type)) {
		return type;
	}

	const parts = version.split('.');
	// Handle simple x.y.z
	if (parts.length < 3) return version;

	let [major, minor, patch] = parts.map((p) => parseInt(p, 10));

	if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
		console.warn(`Skipping version bump for non-standard version: ${version}`);
		return version;
	}

	if (type === 'major') {
		major++;
		minor = 0;
		patch = 0;
	} else if (type === 'minor') {
		minor++;
		patch = 0;
	} else {
		patch++;
	}

	return `${major}.${minor}.${patch}`;
}

const packagesDir = join(rootDir, 'packages');
const rootPackageJson = join(rootDir, 'package.json');
const allPackageJsons = [rootPackageJson, ...findPackageJsons(packagesDir)];

console.log(`Found ${allPackageJsons.length} package.json files.`);
console.log(`Bumping versions (${type})...`);

let updatedCount = 0;

for (const pkgPath of allPackageJsons) {
	try {
		const content = readFileSync(pkgPath, 'utf-8');
		const pkg = JSON.parse(content);

		if (!pkg.version) continue;
		if (pkg.private && !pkg.workspaces && pkgPath === rootPackageJson) {
			// Skip private root package if it's not the main project root (but here we explicitly included rootPackageJson)
			// Actually generally we want to bump everything including private packages if they have versions.
		}

		const oldVersion = pkg.version;
		const newVersion = bumpVersion(oldVersion, type);

		if (oldVersion !== newVersion) {
			pkg.version = newVersion;
			writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
			console.log(`  ${pkg.name || 'root'}: ${oldVersion} -> ${newVersion}`);
			updatedCount++;
		}
	} catch (err) {
		console.error(`Failed to read/write ${pkgPath}: ${err.message}`);
	}
}

console.log(`\n✅ Updated ${updatedCount} packages.`);
