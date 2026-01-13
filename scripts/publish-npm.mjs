#!/usr/bin/env node
/**
 * Publish to npm with temporary package name changes.
 * Similar to how publish:fork:manifest works for Docker.
 *
 * Usage: node scripts/publish-npm.mjs [scope] [--otp=CODE]
 * Example: node scripts/publish-npm.mjs @atom8n
 * Example: node scripts/publish-npm.mjs @atom8n --otp=123456
 *
 * Environment variables:
 * - NPM_OTP: One-time password for 2FA (alternative to --otp flag)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
const scope = args.find((arg) => !arg.startsWith('--')) || '@atom8n';
const otpArg = args.find((arg) => arg.startsWith('--otp='));
const otp = otpArg ? otpArg.split('=')[1] : process.env.NPM_OTP || null;

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

// Helper to parse simple YAML (subset needed for catalog) since we might not have js-yaml avail in all envs,
// but actually we do have it in devDependencies. Let's try to allow for basic parsing if needed,
// but for robustness let's rely on string parsing for this specific structure or just use regex if we want to be zero-dep,
// however passing js-yaml is better.
// Since this is a dev script, we can assume devDependencies are installed.

// Load catalog definitions from pnpm-workspace.yaml
function loadCatalogs() {
	try {
		const workspacePath = join(rootDir, 'pnpm-workspace.yaml');
		const content = readFileSync(workspacePath, 'utf-8');
		const yaml = load(content);
		return {
			default: yaml.catalog || {},
			named: yaml.catalogs || {}
		};
	} catch (error) {
		console.warn('⚠️  Warning: Failed to load pnpm-workspace.yaml for catalog resolution:', error.message);
		return { default: {}, named: {} };
	}
}

const catalogs = loadCatalogs();

// Update dependencies in package.json
function updateDependencies(deps, versionMapping) {
	if (!deps) return deps;
	const updated = {};
	for (const [name, version] of Object.entries(deps)) {
		const newName = nameMapping.get(name) || name;
		
		let newVersion = version;

		// Handle catalog: protocol
		if (version.startsWith('catalog:')) {
			const catalogName = version.replace('catalog:', '');
			if (catalogName === '') {
				// Default catalog
				newVersion = catalogs.default[name] || version;
			} else {
				// Named catalog
				const namedCatalog = catalogs.named[catalogName];
				newVersion = (namedCatalog && namedCatalog[name]) || version;
			}
			
			// If we resolved it, check if it's a workspace version that needs further resolution
			if (newVersion.startsWith('workspace:')) {
				const actualVersion = versionMapping.get(name);
				newVersion = actualVersion || newVersion.replace('workspace:', '');
			}
		} 
		// Handle workspace: protocol
		else if (version.startsWith('workspace:')) {
			const actualVersion = versionMapping.get(name);
			newVersion = actualVersion || version.replace('workspace:', '');
		}

		updated[newName] = newVersion;
	}
	return updated;
}

// Check if package version already exists
function checkVersionExists(name, version) {
	try {
		const result = execSync(`npm view ${name}@${version} version`, {
			stdio: 'pipe',
			encoding: 'utf-8',
		});
		return !!result.trim();
	} catch (error) {
		return false;
	}
}

// Check for uncommitted changes in package.json files
function checkGitClean() {
	try {
		const output = execSync('git status --porcelain', { encoding: 'utf-8' });
		const modifiedPackageJsons = output
			.split('\n')
			.filter((line) => line.includes('package.json') && line.trim().length > 0);

		if (modifiedPackageJsons.length > 0) {
			console.error('❌ Working directory contains uncommitted changes to package.json files:');
			console.error(modifiedPackageJsons.join('\n'));
			console.error('Please clean up or stash your changes before publishing.');
			process.exit(1);
		}
	} catch (error) {
		// Ignore if not a git repo or other error, let it proceed or fail later
		console.warn('⚠️  Warning: Failed to check git status. proceeding...');
	}
}

async function main() {
	checkGitClean();

	console.log(`\n📦 Publishing to npm with scope: ${scope}\n`);

	if (otp) {
		console.log(`🔐 Using 2FA OTP for authentication\n`);
	} else {
		console.log(`ℹ️  Note: If 2FA is enabled, use --otp=CODE or set NPM_OTP env var\n`);
	}

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

	// Step 2: Update all package.json files
	console.log('\nStep 2: Updating package.json files...');
	for (const [pkgPath, originalContent] of originalContents) {
		const pkg = JSON.parse(originalContent);

		// Update name
		pkg.name = nameMapping.get(pkg.name) || pkg.name;

		// Update dependencies with version mapping
		pkg.dependencies = updateDependencies(pkg.dependencies, versionMapping);
		pkg.devDependencies = updateDependencies(pkg.devDependencies, versionMapping);
		pkg.peerDependencies = updateDependencies(pkg.peerDependencies, versionMapping);

		writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
	}

	// Step 3: Publish each package individually (continue on failure)
	console.log('\nStep 3: Publishing to npm...\n');
	let successCount = 0;
	let skipCount = 0;
	let failCount = 0;

	for (const [pkgPath] of originalContents) {
		const pkgDir = dirname(pkgPath);
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		const pkgName = pkg.name;

		try {
			// Check if version already exists
			if (checkVersionExists(pkgName, pkg.version)) {
				console.log(`  ⏭️  ${pkgName}@${pkg.version} (already published)`);
				skipCount++;
				continue;
			}

			// Build publish command with optional OTP
			let publishCmd = 'npm publish --access public';
			if (otp) {
				publishCmd += ` --otp=${otp}`;
			}

			execSync(publishCmd, {
				cwd: pkgDir,
				stdio: 'pipe',
			});
			console.log(`  ✅ ${pkgName}@${pkg.version}`);
			successCount++;
		} catch (error) {
			const stderr = error.stderr?.toString() || '';
			const stdout = error.stdout?.toString() || '';
			const fullError = stderr || stdout || error.message || '';
			console.log(fullError);
			
			// Check for 2FA OTP requirement
			if (fullError.includes('EOTP') || fullError.includes('one-time password')) {
				console.log(`  ❌ ${pkgName}@${pkg.version} - 2FA OTP required`);
				console.log(`     Run with --otp=CODE or set NPM_OTP environment variable`);
				if (failCount === 0) {
					console.log(`\n     Example: pnpm run publish:npm -- --otp=123456`);
				}
				failCount++;
			}
			// Check for common "already published" patterns
			else if (
				fullError.includes('previously published') ||
				(fullError.includes('E403') && !fullError.includes('EOTP')) ||
				fullError.includes('You cannot publish over the previously published versions') ||
				fullError.includes('cannot publish over existing version')
			) {
				console.log(`  ⏭️  ${pkgName}@${pkg.version} (already published)`);
				skipCount++;
			} else {
				// Show more detailed error - get the actual error line
				const errorLines = fullError
					.split('\n')
					.filter(
						(line) =>
							line.includes('npm error') ||
							line.includes('error code') ||
							line.includes('403') ||
							line.includes('401') ||
							line.includes('404') ||
							line.trim().length > 0,
					);
				const errorMsg = errorLines.slice(0, 3).join(' | ') || fullError.slice(0, 200);
				console.log(`  ❌ ${pkgName}@${pkg.version} - ${errorMsg}`);
				failCount++;
			}
		}
	}

	console.log(
		`\n📊 Results: ${successCount} published, ${skipCount} skipped, ${failCount} failed\n`,
	);

	// Step 4: Restore original files
	console.log('Step 4: Restoring original package.json files...');
	for (const [pkgPath, originalContent] of originalContents) {
		writeFileSync(pkgPath, originalContent);
	}

	console.log('✅ Original files restored.\n');
}

main().catch(console.error);
