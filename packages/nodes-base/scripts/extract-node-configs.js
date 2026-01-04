const fs = require('fs');
const path = require('path');

/**
 * Script to extract all supported nodes and their configuration options to JSON
 *
 * This script reads the package.json to get all node paths, then loads each node
 * and extracts its description including all properties (configuration options).
 */

const NODES_BASE_DIR = __dirname + '/..';
const PACKAGE_JSON_PATH = path.join(NODES_BASE_DIR, 'package.json');
const OUTPUT_FILE = path.join(NODES_BASE_DIR, 'node-configs.json');

// Read package.json to get node list
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const nodePaths = packageJson.n8n?.nodes || [];

console.log(`Found ${nodePaths.length} nodes to process...`);

const nodesConfig = {};
let processedCount = 0;
let errorCount = 0;

// Process each node
for (const nodePath of nodePaths) {
	try {
		// Convert dist path to actual file path
		const fullPath = path.join(NODES_BASE_DIR, nodePath);

		// Check if file exists (might not be built yet)
		if (!fs.existsSync(fullPath)) {
			console.warn(`⚠️  Node file not found: ${nodePath}`);
			errorCount++;
			continue;
		}

		// Load the node module
		// Clear require cache to ensure fresh load
		delete require.cache[require.resolve(fullPath)];
		const NodeModule = require(fullPath);

		// Extract class name from filename (e.g., "N8n.node.js" -> "N8n")
		// Handle both .node.js and .node.ee.js files
		let fileName = path.basename(nodePath);
		fileName = fileName.replace('.node.ee.js', '').replace('.node.js', '');
		const className = fileName;

		// Get the node class from exports
		// Try different export patterns
		let NodeClass = NodeModule[className] || NodeModule.default || NodeModule;

		// If still not found, try to find any exported class
		if (typeof NodeClass !== 'function') {
			const exportedClass = Object.values(NodeModule).find(
				(exp) =>
					typeof exp === 'function' &&
					(exp.prototype?.description !== undefined || exp.name === className),
			);
			if (exportedClass) {
				NodeClass = exportedClass;
			} else {
				throw new Error(
					`Could not find node class "${className}" in exports: ${Object.keys(NodeModule).join(', ')}`,
				);
			}
		}

		// Handle both regular nodes and versioned nodes
		let nodeInstance;
		let nodeType;

		try {
			nodeInstance = new NodeClass();
		} catch (error) {
			// Some nodes might need constructor arguments
			throw new Error(`Failed to instantiate node class: ${error.message}`);
		}

		// Get the description
		if (nodeInstance.nodeVersions) {
			// Versioned node - get the latest version
			const versions = Object.keys(nodeInstance.nodeVersions)
				.map(Number)
				.sort((a, b) => b - a);
			const latestVersion = versions[0];
			nodeType = nodeInstance.nodeVersions[latestVersion];
		} else {
			nodeType = nodeInstance;
		}

		const description = nodeType.description;

		if (!description) {
			throw new Error('Node description not found');
		}

		// Extract node information
		const nodeInfo = {
			name: description.name,
			displayName: description.displayName,
			description: description.description,
			version: description.version,
			group: description.group,
			icon: description.icon,
			defaults: description.defaults,
			inputs: description.inputs,
			outputs: description.outputs,
			credentials: description.credentials,
			properties: description.properties || [],
			// Additional metadata
			polling: description.polling,
			supportsCORS: description.supportsCORS,
			maxNodes: description.maxNodes,
			webhooks: description.webhooks,
			hooks: description.hooks,
			subtitle: description.subtitle,
		};

		// Use the node name as key (remove n8n-nodes-base. prefix if present)
		const nodeKey = description.name.replace(/^n8n-nodes-base\./, '');
		nodesConfig[nodeKey] = nodeInfo;

		processedCount++;

		if (processedCount % 50 === 0) {
			console.log(`Processed ${processedCount}/${nodePaths.length} nodes...`);
		}
	} catch (error) {
		console.error(`❌ Error processing ${nodePath}:`, error.message);
		errorCount++;
	}
}

// Write output
const output = {
	metadata: {
		generatedAt: new Date().toISOString(),
		totalNodes: nodePaths.length,
		processedNodes: processedCount,
		errorCount: errorCount,
		source: 'n8n-nodes-base package',
	},
	nodes: nodesConfig,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

console.log('\n✅ Extraction complete!');
console.log(`   Total nodes: ${nodePaths.length}`);
console.log(`   Processed: ${processedCount}`);
console.log(`   Errors: ${errorCount}`);
console.log(`   Output file: ${OUTPUT_FILE}`);
