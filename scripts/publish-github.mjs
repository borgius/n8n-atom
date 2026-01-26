#!/usr/bin/env node
/**
 * Publish to GitHub Packages with temporary package name changes.
 * Similar to how publish-npm.mjs works but targets GitHub Packages registry.
 *
 * Usage: node scripts/publish-github.mjs [scope]
 * Example: node scripts/publish-github.mjs @atom8n
 *
 * Prerequisites:
 * - Set GITHUB_TOKEN environment variable with write:packages permission
 * - Or configure //npm.pkg.github.com/:_authToken in root .npmrc
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Default scope for published packages
const scope = process.argv[2] || '@atom8n';
const GITHUB_REGISTRY = 'https://npm.pkg.github.com';

// Package name mappings: original -> scoped
const nameMapping = new Map();
const originalContents = new Map();

// Find all package.json files
function findPackageJsons(dir) {
	const results = [];
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

	return results;
}

// Transform package name to scoped version
function transformName(name) {
	if (!name) return name;
	if (name.startsWith('@n8n/')) {
		// @n8n/config -> @atom8n/config
		return name.replace('@n8n/', `${scope}/`);
	} else if (name.startsWith('n8n')) {
		// n8n-core -> @atom8n/n8n-core
		return `${scope}/${name}`;
	}
	return name;
}

// Update dependencies in package.json
function updateDependencies(deps, versionMapping) {
	if (!deps) return deps;
	const updated = {};
	for (const [name, version] of Object.entries(deps)) {
		const newName = nameMapping.get(name) || name;
		// Convert workspace: protocol to actual version
		if (version.startsWith('workspace:')) {
			const actualVersion = versionMapping.get(name);
			updated[newName] = actualVersion || version.replace('workspace:', '');
		} else {
			updated[newName] = version;
		}
	}
	return updated;
}

// Get GitHub auth token from root .npmrc or environment
function getGitHubToken() {
	// First check environment variable
	if (process.env.GITHUB_TOKEN) {
		return process.env.GITHUB_TOKEN;
	}

	// Then check root .npmrc
	const npmrcPath = join(rootDir, '.npmrc');
	if (existsSync(npmrcPath)) {
		const npmrc = readFileSync(npmrcPath, 'utf-8');
		const match = npmrc.match(/\/\/npm\.pkg\.github\.com\/:_authToken=(.+)/);
		if (match) {
			return match[1].trim();
		}
	}

	return null;
}

// Track created and modified .npmrc files for cleanup
const createdNpmrcFiles = [];
const modifiedNpmrcFiles = new Map();

async function main() {
	console.log(`\n📦 Publishing to GitHub Packages with scope: ${scope}\n`);
	console.log(`Registry: ${GITHUB_REGISTRY}\n`);

	// Get auth token
	const authToken = getGitHubToken();
	if (!authToken) {
		console.error('❌ No GitHub token found!');
		console.error('   Set GITHUB_TOKEN environment variable or add to .npmrc:');
		console.error('   //npm.pkg.github.com/:_authToken=YOUR_TOKEN');
		process.exit(1);
	}
	console.log('✅ GitHub token found\n');

	const packagesDir = join(rootDir, 'packages');
	const packageJsons = findPackageJsons(packagesDir);

	console.log(`Found ${packageJsons.length} package.json files\n`);

	// Version mapping: original name -> version
	const versionMapping = new Map();

	// Step 1: Build name mapping, version mapping and backup originals
	console.log('Step 1: Building package name mapping...');
	for (const pkgPath of packageJsons) {
		const content = readFileSync(pkgPath, 'utf-8');
		const pkg = JSON.parse(content);

		if (pkg.private) continue;
		if (!pkg.name) continue;

		// Skip template files with placeholders
		if (pkg.name.includes('{{') || pkg.name.includes('}}')) {
			continue;
		}

		originalContents.set(pkgPath, content);

		const originalName = pkg.name;
		const newName = transformName(originalName);
		nameMapping.set(originalName, newName);
		versionMapping.set(originalName, pkg.version || '1.0.0');

		console.log(`  ${originalName} -> ${newName}`);
	}

	// Step 2: Update all package.json files with publishConfig for GitHub
	console.log('\nStep 2: Updating package.json files...');
	for (const [pkgPath, originalContent] of originalContents) {
		const pkg = JSON.parse(originalContent);

		// Update name
		pkg.name = nameMapping.get(pkg.name) || pkg.name;

		// Add publishConfig for GitHub Packages
		pkg.publishConfig = {
			registry: GITHUB_REGISTRY,
			access: 'public',
		};

		// Add repository field (required for GitHub Packages)
		pkg.repository = {
			type: 'git',
			url: 'git+https://github.com/atom8n/n8n.git',
		};

		// Update dependencies with version mapping
		pkg.dependencies = updateDependencies(pkg.dependencies, versionMapping);
		pkg.devDependencies = updateDependencies(pkg.devDependencies, versionMapping);
		pkg.peerDependencies = updateDependencies(pkg.peerDependencies, versionMapping);

		writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

		// Create .npmrc in package directory with auth token
		const pkgDir = dirname(pkgPath);
		const npmrcPath = join(pkgDir, '.npmrc');
		if (existsSync(npmrcPath)) {
			const originalNpmrcContent = readFileSync(npmrcPath, 'utf-8');
			modifiedNpmrcFiles.set(npmrcPath, originalNpmrcContent);
			writeFileSync(npmrcPath, `${originalNpmrcContent}\n//npm.pkg.github.com/:_authToken=${authToken}\n`);
		} else {
			writeFileSync(npmrcPath, `//npm.pkg.github.com/:_authToken=${authToken}\n`);
			createdNpmrcFiles.push(npmrcPath);
		}
	}

	// Step 3: Publish each package individually (continue on failure)
	console.log('\nStep 3: Publishing to GitHub Packages...\n');
	let successCount = 0;
	let skipCount = 0;
	let failCount = 0;

	for (const [pkgPath] of originalContents) {
		const pkgDir = dirname(pkgPath);
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		const pkgName = pkg.name;

		try {
			execSync(`npm publish --registry=${GITHUB_REGISTRY}`, {
				cwd: pkgDir,
				stdio: 'pipe',
			});
			console.log(`  ✅ ${pkgName}@${pkg.version}`);
			successCount++;
		} catch (error) {
			const stderr = error.stderr?.toString() || '';
			console.log(stderr);
			if (
				stderr.includes('previously published') ||
				stderr.includes('E403') ||
				stderr.includes('Cannot publish over')
			) {
				console.log(`  ⏭️  ${pkgName}@${pkg.version} (already published)`);
				skipCount++;
			} else {
				console.log(`  ❌ ${pkgName}@${pkg.version} - ${stderr.split('\n')[0]}`);
				failCount++;
			}
		}
	}

	console.log(
		`\n📊 Results: ${successCount} published, ${skipCount} skipped, ${failCount} failed\n`,
	);

	// Step 4: Restore original files and cleanup .npmrc files
	console.log('Step 4: Restoring original package.json files...');
	for (const [pkgPath, originalContent] of originalContents) {
		writeFileSync(pkgPath, originalContent);
	}

	// Cleanup created and restore modified .npmrc files
	console.log('Step 5: Cleaning up temporary .npmrc files...');
	for (const [path, content] of modifiedNpmrcFiles) {
		try {
			writeFileSync(path, content);
		} catch (e) {
			console.warn(`Failed to restore ${path}`);
		}
	}
	for (const npmrcPath of createdNpmrcFiles) {
		try {
			unlinkSync(npmrcPath);
		} catch (e) {
			// Ignore cleanup errors
		}
	}

	console.log('✅ Original files restored.\n');
}

main().catch(console.error);
