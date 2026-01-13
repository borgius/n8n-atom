#!/usr/bin/env node
/**
 * "Convert" GitHub Packages to public by deleting private ones so they can be republished.
 * (GitHub API does not support changing visibility from Private to Public via REST for NPM packages easily).
 *
 * Usage: node scripts/make-github-packages-public.mjs [org]
 * Example: node scripts/make-github-packages-public.mjs atom8n
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const org = (process.argv[2] || 'atom8n').replace(/^@/, '');
const GITHUB_API = 'https://api.github.com';

function getGitHubToken() {
	if (process.env.GITHUB_TOKEN) {
		return process.env.GITHUB_TOKEN;
	}
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
	console.log(`Deleting private package ${packageName} so it can be republished as public...`);
	
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
	console.log(`\n🔄 Processing packages for: ${org}\n`);

	const token = getGitHubToken();
	if (!token) {
		console.error('❌ No GitHub token found!');
		process.exit(1);
	}

	try {
		const accountType = await getAccountType(token, org);
		console.log(`Detected account type: ${accountType}`);

		console.log('Fetching packages...');
		const packages = await listPackages(token, org, accountType);
		console.log(`Found ${packages.length} packages.`);

		let processedCount = 0;
		let deletedCount = 0;

		for (const pkg of packages) {
            if (pkg.visibility === 'public') {
                console.log(`  ✅ ${pkg.name} is already public`);
                continue;
            }
            
            // It is private
            processedCount++;
			const success = await deletePackage(token, org, pkg.name, accountType);
			if (success) deletedCount++;
		}

		console.log(`\n📊 Results: ${processedCount} private packages found, ${deletedCount} deleted.`);
        if (deletedCount > 0) {
            console.log(`\n⚠️  IMPORTANT: Please run 'pnpm run publish:github' now to republish these packages as public.`);
        }
	} catch (error) {
		console.error(`\n❌ Error: ${error.message}`);
		process.exit(1);
	}
}

main();
