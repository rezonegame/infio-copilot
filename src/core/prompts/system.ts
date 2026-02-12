import * as path from 'path'
import { App, normalizePath } from 'obsidian'
import { FilesSearchSettings } from "../../types/settings"
import {
	CustomModePrompts,
	Mode,
	ModeConfig,
	PromptComponent,
	defaultModeSlug,
	defaultModes,
	getGroupName,
	getModeBySlug
} from "../../utils/modes"

// Removed DiffStrategy, McpHub imports

import { ROOT_DIR } from './constants'
import {
	addCustomInstructions,
	getCapabilitiesSection,
	getMcpServersSection,
	getModesSection,
	getObjectiveSection,
	getRulesSection,
	getSharedToolUseSection,
	getToolUseGuidelinesSection
} from "./sections"
import { getToolDescriptionsForMode } from "./tools"

export class SystemPrompt {
	protected dataDir: string
	protected app: App

	constructor(app: App) {
		this.app = app
		this.dataDir = normalizePath(`${ROOT_DIR}`)
		this.ensureDirectory()
	}

	private async ensureDirectory(): Promise<void> {
		if (!(await this.app.vault.adapter.exists(this.dataDir))) {
			await this.app.vault.adapter.mkdir(this.dataDir)
		}
	}

	private getSystemPromptFilePath(mode: Mode): string {
		return `${mode}/system_prompt.md`
	}

	private async loadSystemPromptFile(mode: Mode): Promise<string> {
		const fileName = this.getSystemPromptFilePath(mode)
		const filePath = normalizePath(path.join(this.dataDir, fileName))
		if (!(await this.app.vault.adapter.exists(filePath))) {
			return ""
		}
		const content = await this.app.vault.adapter.read(filePath)
		return content
	}

	private async generatePrompt(
		cwd: string,
		supportsComputerUse: boolean,
		mode: Mode,
		searchSettings: FilesSearchSettings,
		filesSearchMethod: string,
		// mcpHub?: McpHub,  <- Removed
		// diffStrategy?: DiffStrategy, <- Removed
		browserViewportSize?: string,
		promptComponent?: PromptComponent,
		customModeConfigs?: ModeConfig[],
		globalCustomInstructions?: string,
		preferredLanguage?: string,
		diffEnabled?: boolean,
		experiments?: Record<string, boolean>,
		enableMcpServerCreation?: boolean,
	): Promise<string> {

		const modeConfig = getModeBySlug(mode, customModeConfigs) || defaultModes.find((m) => m.slug === mode) || defaultModes[0]
		const roleDefinition = promptComponent?.roleDefinition || modeConfig.roleDefinition

		// Removed McpHub/DiffStrategy usage
		const [modesSection, mcpServersSection] = await Promise.all([
			getModesSection(),
			Promise.resolve(""), // Empty MCP section
		])

		const basePrompt = `${roleDefinition}

${getSharedToolUseSection()}

${getToolDescriptionsForMode(
			mode,
			cwd,
			searchSettings,
			filesSearchMethod,
			supportsComputerUse,
			undefined, // diffStrategy
			browserViewportSize,
			undefined, // mcpHub
			customModeConfigs,
			experiments,
		)}

${getToolUseGuidelinesSection(mode)}

${mcpServersSection}

${getCapabilitiesSection(
			mode,
			cwd,
			filesSearchMethod,
		)}

${modesSection}

${getRulesSection(
			mode,
			cwd,
			filesSearchMethod,
			supportsComputerUse,
			undefined, // diffStrategy
			experiments,
		)}

${getObjectiveSection(mode)}

${await addCustomInstructions(this.app, promptComponent?.customInstructions || modeConfig.customInstructions || "", globalCustomInstructions || "", cwd, mode, { preferredLanguage })}`

		return basePrompt
	}

	public async getSystemPrompt(
		cwd: string,
		supportsComputerUse: boolean,
		mode: Mode = defaultModeSlug,
		searchSettings: FilesSearchSettings,
		filesSearchMethod: string = 'regex',
		preferredLanguage?: string,
		// diffStrategy?: DiffStrategy,
		customModePrompts?: CustomModePrompts,
		customModes?: ModeConfig[],
		// mcpHub?: McpHub,
		browserViewportSize?: string,
		globalCustomInstructions?: string,
		diffEnabled?: boolean,
		experiments?: Record<string, boolean>,
		enableMcpServerCreation?: boolean,
	): Promise<string> {

		const getPromptComponent = (value: unknown): PromptComponent | undefined => {
			if (typeof value === "object" && value !== null) {
				return value
			}
			return undefined
		}

		const fileCustomSystemPrompt = await this.loadSystemPromptFile(mode)
		const promptComponent = getPromptComponent(customModePrompts?.[mode])
		const currentMode = getModeBySlug(mode, customModes) || defaultModes.find((m) => m.slug === mode) || defaultModes[0]

		if (fileCustomSystemPrompt) {
			const roleDefinition = promptComponent?.roleDefinition || currentMode.roleDefinition
			const customInstructions = await addCustomInstructions(
				this.app,
				promptComponent?.customInstructions || currentMode.customInstructions || "",
				globalCustomInstructions || "",
				cwd,
				mode,
				{ preferredLanguage },
			)
			return `${roleDefinition}

${fileCustomSystemPrompt}

${customInstructions}`
		}

		return this.generatePrompt(
			cwd,
			supportsComputerUse,
			currentMode.slug,
			searchSettings,
			filesSearchMethod,
			// undefined, // mcpHub
			// undefined, // diffStrategy
			browserViewportSize,
			promptComponent,
			customModes,
			globalCustomInstructions,
			preferredLanguage,
			diffEnabled,
			experiments,
			enableMcpServerCreation,
		)
	}
}
