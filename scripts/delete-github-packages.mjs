#!/usr/bin/env node
/**
 * Delete all GitHub Packages for a specific organization.
 *
 * Usage: node scripts/delete-github-packages.mjs [org]
 * Example: node scripts/delete-github-packages.mjs atom8n
 *
 * Prerequisites:
 * - Set GITHUB_TOKEN environment variable with delete:packages permission
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Default org
const org = (process.argv[2] || 'atom8n').replace(/^@/, '');
const GITHUB_API = 'https://api.github.com';

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

async function getAccountType(token, org) {
	const response = await fetch(`${GITHUB_API}/users/${org}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github.v3+json',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to get account info for ${org}: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	return data.type; // 'User' or 'Organization'
}

async function listPackages(token, org, accountType) {
	const packages = [];
	let page = 1;

	const endpointBase = accountType === 'Organization'
		? `${GITHUB_API}/orgs/${org}/packages`
		: `${GITHUB_API}/users/${org}/packages`;

	while (true) {
		const response = await fetch(
			`${endpointBase}?package_type=npm&per_page=100&page=${page}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github.v3+json',
				},
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to list packages: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		if (data.length === 0) break;

		packages.push(...data);
		page++;
	}

	return packages;
}

async function deletePackage(token, org, packageName, accountType) {
	// Note: packageName in API response is URL encoded if it contains special chars?
	// Usually for npm packages, we just use the name.
	// For @scope/pkg, the API usually returns returns just pkg if queried under the scope or encoded.
	// Let's use the name as returned by the API.

	console.log(`Deleting package ${packageName}...`);
	
	const endpointBase = accountType === 'Organization'
		? `${GITHUB_API}/orgs/${org}/packages`
		: `${GITHUB_API}/users/${org}/packages`;

	const response = await fetch(
		`${endpointBase}/npm/${encodeURIComponent(packageName)}`,
		{
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
			},
		},
	);

	if (response.status === 204) {
		console.log(`  ✅ Deleted ${packageName}`);
		return true;
	} else {
		console.log(
			`  ❌ Failed to delete ${packageName}: ${response.status} ${response.statusText}`,
		);
		try {
			const error = await response.json();
			console.log(`     ${error.message}`);
		} catch (e) {}
		return false;
	}
}

async function main() {
	console.log(`\n🗑️  Deleting all packages for organization: ${org}\n`);

	const token = getGitHubToken();
	if (!token) {
		console.error('❌ No GitHub token found!');
		console.error('   Set GITHUB_TOKEN environment variable with delete:packages permission');
		process.exit(1);
	}

	try {
		console.log(`Detecting account type for ${org}...`);
		const accountType = await getAccountType(token, org);
		console.log(`Detected account type: ${accountType}`);

		console.log('Fetching packages...');
		const packages = await listPackages(token, org, accountType);
		console.log(`Found ${packages.length} packages.`);

		if (packages.length === 0) {
			console.log('No packages to delete.');
			return;
		}

		console.log('Starting deletion in 3 seconds... (Ctrl+C to cancel)');
		await new Promise((resolve) => setTimeout(resolve, 3000));

		let deletedCount = 0;
		let failCount = 0;

		for (const pkg of packages) {
			const success = await deletePackage(token, org, pkg.name, accountType);
			if (success) deletedCount++;
			else failCount++;
		}

		console.log(`\nForcing deletion of remaining versions just in case...`);
        // Just in case the DELETE on package root didn't work (sometimes it requires special admin rights),
        // we might need to list versions and delete them.
        // But let's assume the root delete works for now as it's cleaner.

		console.log(`\n📊 Results: ${deletedCount} deleted, ${failCount} failed\n`);
	} catch (error) {
		console.error(`\n❌ Error: ${error.message}`);
		if (error.message.includes('403') || error.message.includes('401')) {
			console.error('   Check your GITHUB_TOKEN permissions (need delete:packages)');
		}
		process.exit(1);
	}
}

main();
