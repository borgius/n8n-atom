import {
	WorkflowRepository,
	SharedWorkflowRepository,
	ProjectRepository,
	generateNanoId,
} from '@n8n/db';
import { Command } from '@n8n/decorators';
import { Container } from '@n8n/di';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { IWorkflowBase, IWorkflowExecutionDataProcess } from 'n8n-workflow';
import { ExecutionBaseError, jsonParse, UnexpectedError, UserError } from 'n8n-workflow';
import { z } from 'zod';

import { ActiveExecutions } from '@/active-executions';
import { OwnershipService } from '@/services/ownership.service';
import { findCliWorkflowStart, isWorkflowIdValid } from '@/utils';
import { WorkflowRunner } from '@/workflow-runner';

import { BaseCommand } from './base-command';

const flagsSchema = z.object({
	file: z.string().describe('Path to the JSON workflow file to execute'),
	rawOutput: z.boolean().describe('Outputs only JSON data, with no other text').optional(),
});

@Command({
	name: 'execute-file',
	description: 'Executes a workflow from a JSON file',
	examples: ['--file=workflow.json', '--file=/path/to/workflow.json --rawOutput'],
	flagsSchema,
})
export class ExecuteFile extends BaseCommand<z.infer<typeof flagsSchema>> {
	override needsCommunityPackages = true;

	override needsTaskRunner = false; // Can work without task runner if another instance is running

	async init() {
		await super.init();
		await this.initBinaryDataService();
		await this.initDataDeduplicationService();
		await this.initExternalHooks();
	}

	async run() {
		const { flags } = this;

		if (!flags.file) {
			throw new UserError(
				'The --file flag is required. Please provide a path to the workflow JSON file.',
			);
		}

		// Resolve the file path (handle both absolute and relative paths)
		const filePath = path.resolve(flags.file);

		if (!fs.existsSync(filePath)) {
			throw new UserError(`The workflow file does not exist: ${filePath}`);
		}

		let workflowData: IWorkflowBase;
		try {
			const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
			workflowData = jsonParse<IWorkflowBase>(fileContent);
		} catch (error) {
			throw new UserError(
				`Failed to parse workflow file: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Validate basic workflow structure
		if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
			throw new UserError('The workflow file does not contain valid nodes.');
		}

		if (!workflowData.connections || typeof workflowData.connections !== 'object') {
			throw new UserError('The workflow file does not contain valid connections.');
		}

		const user = await Container.get(OwnershipService).getInstanceOwner();
		const workflowRepository = Container.get(WorkflowRepository);
		const sharedWorkflowRepository = Container.get(SharedWorkflowRepository);
		const projectRepository = Container.get(ProjectRepository);

		// For file-based execution, we need to create a temporary workflow in the database
		// to satisfy foreign key constraints when saving execution
		let workflowId: string;
		if (isWorkflowIdValid(workflowData.id)) {
			// Check if workflow already exists
			const existing = await workflowRepository.findOneBy({ id: workflowData.id });
			if (existing) {
				workflowId = workflowData.id;
				// Update the workflow data with the existing one
				workflowData = existing;
			} else {
				// Create new workflow with the provided ID
				workflowId = workflowData.id;
				await this.createTemporaryWorkflow(
					workflowData,
					user.id,
					workflowRepository,
					sharedWorkflowRepository,
					projectRepository,
				);
			}
		} else {
			// Generate a new ID and create temporary workflow
			workflowId = generateNanoId();
			workflowData.id = workflowId;
			await this.createTemporaryWorkflow(
				workflowData,
				user.id,
				workflowRepository,
				sharedWorkflowRepository,
				projectRepository,
			);
		}

		const startingNode = findCliWorkflowStart(workflowData.nodes);

		const runData: IWorkflowExecutionDataProcess = {
			executionMode: 'cli',
			startNodes: [{ name: startingNode.name, sourceData: null }],
			workflowData,
			userId: user.id,
		};

		const workflowRunner = Container.get(WorkflowRunner);

		if (this.globalConfig.executions.mode === 'queue') {
			this.logger.warn(
				'CLI command `execute-file` does not support queue mode. Falling back to regular mode.',
			);
			this.globalConfig.executions.mode = 'regular';
		}

		const executionId = await workflowRunner.run(runData);

		const activeExecutions = Container.get(ActiveExecutions);
		const data = await activeExecutions.getPostExecutePromise(executionId);

		if (data === undefined) {
			throw new UnexpectedError('Workflow did not return any data');
		}

		if (data.data.resultData.error) {
			this.logger.info('Execution was NOT successful. See log message for details.');
			this.logger.info('Execution error:');
			this.logger.info('====================================');
			this.logger.info(JSON.stringify(data, null, 2));

			const { error } = data.data.resultData;
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			throw {
				...error,
				stack: error.stack,
			};
		}

		if (flags.rawOutput === undefined) {
			this.log('Execution was successful:');
			this.log('====================================');
		}
		this.log(JSON.stringify(data, null, 2));
	}

	async catch(error: Error) {
		this.logger.error('Error executing workflow. See log messages for details.');
		this.logger.error('\nExecution error:');
		this.logger.info('====================================');
		this.logger.error(error.message);
		if (error instanceof ExecutionBaseError) this.logger.error(error.description!);
		this.logger.error(error.stack!);
	}

	private async createTemporaryWorkflow(
		workflowData: IWorkflowBase,
		userId: string,
		workflowRepository: WorkflowRepository,
		sharedWorkflowRepository: SharedWorkflowRepository,
		projectRepository: ProjectRepository,
	): Promise<void> {
		const { manager: dbManager } = workflowRepository;

		await dbManager.transaction(async (transactionManager) => {
			// Get user's personal project
			const personalProject = await projectRepository.getPersonalProjectForUserOrFail(
				userId,
				transactionManager,
			);

			// Create workflow entity with required fields
			const workflowEntity = workflowRepository.create({
				...workflowData,
				active: false,
				isArchived: false, // Keep visible in UI
				versionId: workflowData.versionId || uuidv4(),
				createdAt: workflowData.createdAt || new Date(),
				updatedAt: workflowData.updatedAt || new Date(),
			});

			const savedWorkflow = await transactionManager.save(workflowEntity);

			// Create shared workflow relationship
			const sharedWorkflow = sharedWorkflowRepository.create({
				role: 'workflow:owner',
				projectId: personalProject.id,
				workflow: savedWorkflow,
			});

			await transactionManager.save(sharedWorkflow);
		});
	}
}
