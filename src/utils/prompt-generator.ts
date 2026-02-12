import { App, TAbstractFile, TFile, TFolder, Vault, getLanguage, normalizePath } from 'obsidian'
import { editorStateToPlainText } from '../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { QueryProgressState } from '../components/chat-view/QueryProgress'
import { SystemPrompt } from '../core/prompts/system'
import { ChatMessage, ChatUserMessage } from '../types/chat'
import { RequestMessage } from '../types/llm/request'
import {
	MentionableBlock,
	MentionableFile,
	MentionableFolder,
	MentionableUrl,
	MentionableVault
} from '../types/mentionable'
import { InfioSettings } from '../types/settings'
import { CustomModePrompts, ModeConfig } from "../utils/modes"
import { readTFileContent } from './obsidian'

export function addLineNumbers(content: string, startLine: number = 1): string {
	const lines = content.split("\n")
	const maxLineNumberWidth = String(startLine + lines.length - 1).length
	return lines
		.map((line, index) => {
			const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, " ")
			return `${lineNumber} | ${line}`
		})
		.join("\n")
}

export function getFullLanguageName(code: string): string {
	try {
		return new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
	} catch {
		return code.toUpperCase();
	}
}

async function getFileOrFolderContent(
	path: TAbstractFile,
	vault: Vault,
	app?: App
): Promise<string> {
	try {
		if (path instanceof TFile) {
			if (path.extension !== 'md' && path.extension !== 'txt' && path.extension !== 'js' && path.extension !== 'ts' && path.extension !== 'css' && path.extension !== 'html' && path.extension !== 'json') {
				// Simple binary check/allowlist
				return `(File type ${path.extension} not supported for reading content directly)`
			}
			return addLineNumbers(await readTFileContent(path, vault))
		} else if (path instanceof TFolder) {
			// Folders: list contents
			const entries = path.children
			let folderContent = ""
			entries.forEach((entry, index) => {
				const isLast = index === entries.length - 1
				const linePrefix = isLast ? "└── " : "├── "
				folderContent += `${linePrefix}${entry.name}${entry instanceof TFolder ? '/' : ''}\n`
			})
			return folderContent
		} else {
			return `(Failed to read contents of ${path.path})`
		}
	} catch (error) {
		return `(Error reading path "${path.path}": ${error.message})`
	}
}

function formatSection(title: string, content: string | null | undefined): string {
	if (!content || content.trim() === '') {
		return ''
	}
	return `\n\n# ${title}\n${content.trim()}`
}

export class PromptGenerator {
	private app: App
	private settings: InfioSettings
	private systemPrompt: SystemPrompt
	private customModePrompts: CustomModePrompts | null = null
	private customModeList: ModeConfig[] | null = null

	constructor(
		// getRagEngine removed
		app: App,
		settings: InfioSettings,
		// diffStrategy removed
		customModePrompts?: CustomModePrompts,
		customModeList?: ModeConfig[],
		// getMcpHub removed
	) {
		this.app = app
		this.settings = settings
		this.systemPrompt = new SystemPrompt(this.app)
		this.customModePrompts = customModePrompts ?? null
		this.customModeList = customModeList ?? null
	}

	public async generateRequestMessages({
		messages,
		useVaultSearch,
		onQueryProgressChange,
	}: {
		messages: ChatMessage[]
		useVaultSearch?: boolean
		onQueryProgressChange?: (queryProgress: QueryProgressState) => void
	}): Promise<{
		requestMessages: RequestMessage[]
		compiledMessages: ChatMessage[]
	}> {
		if (messages.length === 0) throw new Error('No messages provided')

		const lastUserMessage = messages[messages.length - 1]
		if (lastUserMessage.role !== 'user') throw new Error('Last message is not a user message')

		const isNewChat = messages.filter(message => message.role === 'user').length === 1

		const { promptContent } = await this.compileUserMessagePrompt({
			isNewChat,
			message: lastUserMessage,
			messages,
			useVaultSearch,
			onQueryProgressChange,
		})

		const compiledMessages = [
			...messages.slice(0, -1),
			{
				...lastUserMessage,
				promptContent,
				// RAG results removed
			},
		]

		const userLanguage = getFullLanguageName(getLanguage())
		const systemMessageContent = await this.systemPrompt.getSystemPrompt(
			'', // cwd
			false, // supportsComputerUse
			this.settings.mode, // mode
			this.settings.filesSearchSettings, // searchSettings
			'regex', // filesSearchMethod
			userLanguage,
			this.customModePrompts || undefined,
			this.customModeList || undefined,
			// undefined, // mcpHub
			// undefined, // diffStrategy
		)

		const requestMessages: RequestMessage[] = [
			{ role: 'system', content: systemMessageContent },
			...compiledMessages.slice(-19) // Keep last 19 messages context
				.filter((message) => !(message.role === 'assistant' && message.isToolResult))
				.map((message): RequestMessage => {
					if (message.role === 'user') {
						return {
							role: 'user',
							content: message.promptContent ?? '',
						}
					} else {
						return {
							role: 'assistant',
							content: message.content,
						}
					}
				}),
		]

		return {
			requestMessages,
			compiledMessages,
		}
	}

	private async compileUserMessagePrompt({
		isNewChat,
		message,
		messages,
		useVaultSearch,
		onQueryProgressChange,
	}: {
		isNewChat: boolean
		message: ChatUserMessage
		messages?: ChatMessage[]
		useVaultSearch?: boolean
		onQueryProgressChange?: (queryProgress: QueryProgressState) => void
	}): Promise<{
		promptContent: ChatUserMessage['promptContent']
	}> {

		// Build prompt content
		const query = editorStateToPlainText(message.content)

		// Context blocks
		let attachedContext = ""

		// Read mentioned files
		const files = message.mentionables.filter((m): m is MentionableFile => m.type === 'file').map(m => m.file)
		if (files.length > 0) {
			onQueryProgressChange?.({ type: 'reading-files', totalFiles: files.length, completedFiles: 0 })
			let completed = 0;
			for (const file of files) {
				const content = await getFileOrFolderContent(file, this.app.vault, this.app)
				attachedContext += `<user_mention_file path="${file.path}">\n${content}\n</user_mention_file>\n`
				completed++;
				onQueryProgressChange?.({ type: 'reading-files', totalFiles: files.length, completedFiles: completed })
			}
		}

		// Read mentioned folders
		const folders = message.mentionables.filter((m): m is MentionableFolder => m.type === 'folder').map(m => m.folder)
		if (folders.length > 0) {
			for (const folder of folders) {
				const content = await getFileOrFolderContent(folder, this.app.vault, this.app)
				attachedContext += `<user_mention_folder path="${folder.path}">\n${content}\n</user_mention_folder>\n`
			}
		}

		// Read mentioned blocks
		const blocks = message.mentionables.filter((m): m is MentionableBlock => m.type === 'block')
		if (blocks.length > 0) {
			for (const block of blocks) {
				const content = addLineNumbers(block.content, block.startLine)
				attachedContext += `<user_mention_blocks location="${block.file.path}#L${block.startLine}-${block.endLine}">\n${content}\n</user_mention_blocks>\n`
			}
		}

		// Note: removed URL fetching support to avoid complex deps/MCP, unless strictly needed. 
		// For now simple API assistant doesn't fetch URLs.

		// Current file context
		const currentFile = message.mentionables.find((m): m is MentionableFile => m.type === 'current-file')
		if (currentFile && currentFile.file) {
			const content = await getFileOrFolderContent(currentFile.file, this.app.vault, this.app)
			attachedContext += `<current_tab_note path="${currentFile.file.path}">\n${content}\n</current_tab_note>\n`
		}

		// Environment details (simplified)
		const envDetails = await this.getEnvironmentDetails()

		const fullPrompt = `${envDetails}\n\n${attachedContext}\n\n${isNewChat ? '<task>' : '<feedback>'}\n${query}\n${isNewChat ? '</task>' : '</feedback>'}`

		return {
			promptContent: fullPrompt
		}
	}

	private async getEnvironmentDetails(): Promise<string> {
		const currentFile = this.app.workspace.getActiveFile()
		const currentFilePath = currentFile ? formatSection("Current File", currentFile.path) : formatSection("Current File", "(No current file active)")

		const now = new Date().toLocaleString()
		const state = `## Current Time\n${now}\n\n## Current Mode\n${this.settings.mode}`

		return `<environment_details>\n${currentFilePath}\n${formatSection('Assistant & User State', state)}\n</environment_details>`
	}
}
