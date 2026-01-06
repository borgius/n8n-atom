#!/usr/bin/env node
/**
 * Build n8n and runners Docker images locally
 *
 * This script simulates the CI build process for local testing.
 * Default output: 'n8nio/n8n:local' and 'n8nio/runners:local'
 * Override with IMAGE_BASE_NAME and IMAGE_TAG environment variables.
 *
 * Multi-platform builds:
 * By default, builds for both amd64 and arm64 architectures with the same tag,
 * creating a multi-platform manifest. Set MULTI_PLATFORM=false to build only
 * for the host architecture.
 */

import { $, echo, fs, chalk, os } from 'zx';
import { fileURLToPath } from 'url';
import path from 'path';

// Disable verbose mode for cleaner output
$.verbose = false;
process.env.FORCE_COLOR = '1';

// #region ===== Helper Functions =====

/**
 * Get Docker platform string based on host architecture
 * @returns {string} Platform string (e.g., 'linux/amd64')
 */
function getDockerPlatform() {
	const arch = os.arch();
	const dockerArch = {
		x64: 'amd64',
		arm64: 'arm64',
	}[arch];

	if (!dockerArch) {
		throw new Error(`Unsupported architecture: ${arch}. Only x64 and arm64 are supported.`);
	}

	return `linux/${dockerArch}`;
}

/**
 * Get platforms to build for
 * @returns {string[]} Array of platform strings
 */
function getPlatforms() {
	// Default to multi-platform, allow disabling with MULTI_PLATFORM=false or MULTI_PLATFORM=0
	const multiPlatform = process.env.MULTI_PLATFORM !== 'false' && process.env.MULTI_PLATFORM !== '0';
	if (multiPlatform) {
		return ['linux/amd64', 'linux/arm64'];
	}
	return [getDockerPlatform()];
}

/**
 * Format duration in seconds
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
	return `${Math.floor(ms / 1000)}s`;
}

/**
 * Get Docker image size
 * @param {string} imageName - Full image name with tag
 * @returns {Promise<string>} Image size or 'Unknown'
 */
async function getImageSize(imageName) {
	try {
		const { stdout } = await $`docker images ${imageName} --format "{{.Size}}"`;
		return stdout.trim();
	} catch {
		return 'Unknown';
	}
}

/**
 * Check if a command exists
 * @param {string} command - Command to check
 * @returns {Promise<boolean>} True if command exists
 */
async function commandExists(command) {
	try {
		await $`command -v ${command}`;
		return true;
	} catch {
		return false;
	}
}

const SupportedContainerEngines = /** @type {const} */ (['docker', 'podman']);

/**
 * Detect if the local `docker` CLI is actually Podman via the docker shim.
 * @returns {Promise<boolean>}
 */
async function isDockerPodmanShim() {
	try {
		const { stdout } = await $`docker version`;
		return stdout.toLowerCase().includes('podman');
	} catch {
		return false;
	}
}
/**
 * @returns {Promise<(typeof SupportedContainerEngines[number])>}
 */
async function getContainerEngine() {
	// Allow explicit override via env var
	const override = process.env.CONTAINER_ENGINE?.toLowerCase();
	if (override && /** @type {readonly string[]} */ (SupportedContainerEngines).includes(override)) {
		return /** @type {typeof SupportedContainerEngines[number]} */ (override);
	}

	const hasDocker = await commandExists('docker');
	const hasPodman = await commandExists('podman');

	if (hasDocker) {
		// If docker is actually a Podman shim, use podman path to avoid unsupported flags like --load
		if (hasPodman && (await isDockerPodmanShim())) {
			return 'podman';
		}
		return 'docker';
	}

	if (hasPodman) return 'podman';

	throw new Error('No supported container engine found. Please install Docker or Podman.');
}

// #endregion ===== Helper Functions =====

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isInScriptsDir = path.basename(__dirname) === 'scripts';
const rootDir = isInScriptsDir ? path.join(__dirname, '..') : __dirname;

const config = {
	n8n: {
		dockerfilePath: path.join(rootDir, 'docker/images/n8n/Dockerfile'),
		imageBaseName: process.env.IMAGE_BASE_NAME || 'n8nio/n8n',
		imageTag: process.env.IMAGE_TAG || 'local',
		get fullImageName() {
			return `${this.imageBaseName}:${this.imageTag}`;
		},
	},
	runners: {
		dockerfilePath: path.join(rootDir, 'docker/images/runners/Dockerfile'),
		imageBaseName: process.env.RUNNERS_IMAGE_BASE_NAME || 'n8nio/runners',
		get imageTag() {
			// Runners use the same tag as n8n for consistency
			return config.n8n.imageTag;
		},
		get fullImageName() {
			return `${this.imageBaseName}:${this.imageTag}`;
		},
	},
	buildContext: rootDir,
	compiledAppDir: path.join(rootDir, 'compiled'),
	compiledTaskRunnerDir: path.join(rootDir, 'dist', 'task-runner-javascript'),
};

// #region ===== Main Build Process =====

const platforms = getPlatforms();
const isMultiPlatform = platforms.length > 1;

async function main() {
	echo(chalk.blue.bold('===== Docker Build for n8n & Runners ====='));
	echo(`INFO: n8n Image: ${config.n8n.fullImageName}`);
	echo(`INFO: Runners Image: ${config.runners.fullImageName}`);
	echo(`INFO: Platforms: ${platforms.join(', ')}`);
	if (isMultiPlatform) {
		echo(chalk.yellow('INFO: Multi-platform build enabled - will create manifest'));
	}
	echo(chalk.gray('-'.repeat(47)));

	await checkPrerequisites();

	// Build n8n Docker image
	const n8nBuildTime = await buildDockerImage({
		name: 'n8n',
		dockerfilePath: config.n8n.dockerfilePath,
		fullImageName: config.n8n.fullImageName,
	});

	// Build runners Docker image
	const runnersBuildTime = await buildDockerImage({
		name: 'runners',
		dockerfilePath: config.runners.dockerfilePath,
		fullImageName: config.runners.fullImageName,
	});

	// Get image details
	const n8nImageSize = await getImageSize(config.n8n.fullImageName);
	const runnersImageSize = await getImageSize(config.runners.fullImageName);

	// Display summary
	const summary = [];
	for (const platform of platforms) {
		summary.push({
			imageName: config.n8n.fullImageName,
			platform,
			size: isMultiPlatform ? 'See manifest' : n8nImageSize,
			buildTime: n8nBuildTime,
		});
		summary.push({
			imageName: config.runners.fullImageName,
			platform,
			size: isMultiPlatform ? 'See manifest' : runnersImageSize,
			buildTime: runnersBuildTime,
		});
	}
	displaySummary(summary);
}

async function checkPrerequisites() {
	if (!(await fs.pathExists(config.compiledAppDir))) {
		echo(chalk.red(`Error: Compiled app directory not found at ${config.compiledAppDir}`));
		echo(chalk.yellow('Please run build-n8n.mjs first!'));
		process.exit(1);
	}

	if (!(await fs.pathExists(config.compiledTaskRunnerDir))) {
		echo(chalk.red(`Error: Task runner directory not found at ${config.compiledTaskRunnerDir}`));
		echo(chalk.yellow('Please run build-n8n.mjs first!'));
		process.exit(1);
	}

	// Ensure at least one supported container engine is available
	if (!(await commandExists('docker')) && !(await commandExists('podman'))) {
		echo(chalk.red('Error: Neither Docker nor Podman is installed or in PATH'));
		process.exit(1);
	}
}

async function buildDockerImage({ name, dockerfilePath, fullImageName }) {
	const startTime = Date.now();
	const containerEngine = await getContainerEngine();

	if (isMultiPlatform) {
		// Multi-platform build: build each platform separately, then create manifest
		if (containerEngine === 'podman') {
			echo(chalk.yellow(`INFO: Building ${name} Docker image for multiple platforms using ${containerEngine}...`));
			echo(chalk.yellow('WARNING: Podman multi-platform builds may have limitations'));

			// Podman: build for all platforms at once (if supported)
			try {
				const platformsStr = platforms.join(',');
				const { stdout } = await $`podman build \
					--platform ${platformsStr} \
					--manifest ${fullImageName} \
					-f ${dockerfilePath} \
					${config.buildContext}`;
				echo(stdout);
			} catch (error) {
				// Fallback: build each platform separately
				echo(chalk.yellow('Falling back to per-platform builds for Podman...'));
				for (const platform of platforms) {
					const platformTag = `${fullImageName}-${platform.split('/')[1]}`;
					echo(chalk.yellow(`Building ${name} for ${platform}...`));
					await $`podman build \
						--platform ${platform} \
						--build-arg TARGETPLATFORM=${platform} \
						-t ${platformTag} \
						-f ${dockerfilePath} \
						${config.buildContext}`;
				}
				// Note: Podman manifest creation may require manual steps
				echo(chalk.yellow('NOTE: You may need to manually create manifest with: podman manifest create'));
			}
		} else {
			// Docker: build each platform separately, then create manifest
			const platformTags = [];
			for (const platform of platforms) {
				const platformArch = platform.split('/')[1];
				const platformTag = `${fullImageName}-${platformArch}`;
				platformTags.push(platformTag);

				echo(chalk.yellow(`Building ${name} for ${platform}...`));
				try {
					const { stdout } = await $`docker buildx build \
						--platform ${platform} \
						--build-arg TARGETPLATFORM=${platform} \
						-t ${platformTag} \
						-f ${dockerfilePath} \
						--load \
						${config.buildContext}`;
					echo(stdout);
				} catch (error) {
					echo(chalk.red(`ERROR: ${name} Docker build failed for ${platform}: ${error.stderr || error.message}`));
					process.exit(1);
				}
			}

			// Create multi-platform manifest
			echo(chalk.yellow(`Creating multi-platform manifest for ${name}...`));
			try {
				// Build command with array items as separate arguments
				const manifestCmd = ['docker', 'buildx', 'imagetools', 'create', '-t', fullImageName, ...platformTags];
				await $(manifestCmd);
				echo(chalk.green(`✅ Multi-platform manifest created: ${fullImageName}`));
			} catch (error) {
				echo(chalk.red(`ERROR: Failed to create manifest: ${error.stderr || error.message}`));
				echo(chalk.yellow('You can manually create the manifest with:'));
				echo(chalk.gray(`  docker buildx imagetools create -t ${fullImageName} ${platformTags.join(' ')}`));
				process.exit(1);
			}
		}
	} else {
		// Single platform build
		const platform = platforms[0];
		echo(chalk.yellow(`INFO: Building ${name} Docker image using ${containerEngine}...`));

		try {
			if (containerEngine === 'podman') {
				const { stdout } = await $`podman build \
					--platform ${platform} \
					--build-arg TARGETPLATFORM=${platform} \
					-t ${fullImageName} \
					-f ${dockerfilePath} \
					${config.buildContext}`;
				echo(stdout);
			} else {
				// Use docker buildx build to leverage Blacksmith's layer caching when running in CI.
				// The setup-docker-builder action creates a buildx builder with sticky disk cache.
				const { stdout } = await $`docker buildx build \
					--platform ${platform} \
					--build-arg TARGETPLATFORM=${platform} \
					-t ${fullImageName} \
					-f ${dockerfilePath} \
					--load \
					${config.buildContext}`;
				echo(stdout);
			}
		} catch (error) {
			echo(chalk.red(`ERROR: ${name} Docker build failed: ${error.stderr || error.message}`));
			process.exit(1);
		}
	}

	return formatDuration(Date.now() - startTime);
}

function displaySummary(images) {
	echo('');
	echo(chalk.green.bold('═'.repeat(54)));
	echo(chalk.green.bold('           DOCKER BUILD COMPLETE'));
	echo(chalk.green.bold('═'.repeat(54)));
	for (const { imageName, platform, size, buildTime } of images) {
		echo(chalk.green(`✅ Image built: ${imageName}`));
		echo(`   Platform: ${platform}`);
		echo(`   Size: ${size}`);
		echo(`   Build time: ${buildTime}`);
		echo('');
	}
	echo(chalk.green.bold('═'.repeat(54)));
}

// #endregion ===== Main Build Process =====

main().catch((error) => {
	echo(chalk.red(`Unexpected error: ${error.message}`));
	process.exit(1);
});
