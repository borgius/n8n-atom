#!/usr/bin/env node
/**
 * Publish to npm with temporary package name changes.
 * Similar to how publish:fork:manifest works for Docker.
 * 
 * Usage: node scripts/publish-npm.mjs [scope]
 * Example: node scripts/publish-npm.mjs @atom8n
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Default scope for published packages
const scope = process.argv[2] || '@atom8n';

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

async function main() {
  console.log(`\n📦 Publishing to npm with scope: ${scope}\n`);
  
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
      execSync('npm publish --access public', {
        cwd: pkgDir,
        stdio: 'pipe'
      });
      console.log(`  ✅ ${pkgName}@${pkg.version}`);
      successCount++;
    } catch (error) {
      const stderr = error.stderr?.toString() || '';
      if (stderr.includes('previously published') || stderr.includes('E403')) {
        console.log(`  ⏭️  ${pkgName}@${pkg.version} (already published)`);
        skipCount++;
      } else {
        console.log(`  ❌ ${pkgName}@${pkg.version} - ${stderr.split('\n')[0]}`);
        failCount++;
      }
    }
  }
  
  console.log(`\n📊 Results: ${successCount} published, ${skipCount} skipped, ${failCount} failed\n`);
  
  // Step 4: Restore original files
  console.log('Step 4: Restoring original package.json files...');
  for (const [pkgPath, originalContent] of originalContents) {
    writeFileSync(pkgPath, originalContent);
  }
  
  console.log('✅ Original files restored.\n');
}

main().catch(console.error);
