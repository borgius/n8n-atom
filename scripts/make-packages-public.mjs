#!/usr/bin/env node
/**
 * Convert all private packages to public by setting "private": false in package.json.
 * This allows them to be published by the publish-github.mjs script.
 *
 * Usage: node scripts/make-packages-public.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

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

function main() {
	console.log('\n🔓 Converting private packages to public...\n');

	const packagesDir = join(rootDir, 'packages');
	const packageJsons = findPackageJsons(packagesDir);

	console.log(`Found ${packageJsons.length} package.json files`);

	let convertedCount = 0;
	let alreadyPublicCount = 0;

	for (const pkgPath of packageJsons) {
		const content = readFileSync(pkgPath, 'utf-8');
		const pkg = JSON.parse(content);

		if (pkg.private === true) {
			console.log(`  Converting ${pkg.name || 'unnamed package'} to public...`);
			pkg.private = false;
			
			// Maintain indentation
			writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
			convertedCount++;
		} else {
			alreadyPublicCount++;
		}
	}

	console.log(`\n📊 Results: ${convertedCount} converted, ${alreadyPublicCount} already public\n`);
}

main();
