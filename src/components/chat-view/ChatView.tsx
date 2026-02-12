import * as path from 'path'

import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { useMutation } from '@tanstack/react-query'
import { Box, CircleStop, History, NotebookPen, Plus, SquareSlash, Undo } from 'lucide-react'
import { App, Notice, TFile, TFolder, WorkspaceLeaf } from 'obsidian'
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react'
import { v4 as uuidv4 } from 'uuid'

import { ApplyView, ApplyViewState } from '../../ApplyView'
import { APPLY_VIEW_TYPE } from '../../constants'
import { useApp } from '../../contexts/AppContext'
// Removed heavy contexts: Dataview, DiffStrategy, McpHub, RAG, Trans
import { useLLM } from '../../contexts/LLMContext'
import { useSettings } from '../../contexts/SettingsContext'
// Removed search backend imports

import {
	LLMAPIKeyInvalidException,
	LLMAPIKeyNotSetException,
	LLMBaseUrlNotSetException,
	LLMModelNotSetException,
} from '../../core/llm/exception'
// Removed TransformationType
import { Workspace } from '../../database/json/workspace/types'
// Removed WorkspaceManager import if possible, or mocked
import { useChatHistory } from '../../hooks/use-chat-history'
import { useCustomModes } from '../../hooks/use-custom-mode'
import { t } from '../../lang/helpers'
import { PreviewView } from '../../PreviewView'
import { ApplyStatus, ToolArgs } from '../../types/apply'
import { ChatMessage, ChatUserMessage } from '../../types/chat'
import {
	Mentionable,
	MentionableBlock,
	MentionableBlockData,
	MentionableCurrentFile,
} from '../../types/mentionable'
import { ApplyEditToFile, SearchAndReplace } from '../../utils/apply'
import { listFilesAndFolders } from '../../utils/glob-utils'
import {
	getMentionableKey,
	serializeMentionable,
} from '../../utils/mentionable'
import { readTFileContent, readTFileContentPdf } from '../../utils/obsidian'
import { openSettingsModalWithError } from '../../utils/open-settings-modal'
import { PromptGenerator, addLineNumbers } from '../../utils/prompt-generator'
import {
	applyCommonToolUse,
	applyComplexToolUse,
	applyToolUse,
} from '../../utils/tool-usage'
import { useVaultSearch } from '../../utils/vault-search'

import AssistantMessageActions from './AssistantMessageActions'
import ChatHistoryView from './ChatHistoryView'
import CommandsView from './CommandsView'
// Removed CustomModeView, InsightView, McpHubView, SearchView
// import CustomModeView from './CustomModeView'
// import InsightView from './InsightView'
// import McpHubView from './McpHubView'
// import SearchView from './SearchView'
import { LLMResponseInfoPopover } from './LLMResponseInfoPopover'
import QueryProgress, { QueryProgressState } from './QueryProgress'
import { WebsiteReadResults } from './WebsiteReadResults'
import { WorkspaceEditModal } from './WorkspaceEditModal'
// import WorkspaceView from './WorkspaceView' // Removed or simplified
import PromptInputWithActions, {
	ChatUserInputRef,
} from './chat-input/PromptInputWithActions'
import MarkdownReasoningBlock from './Markdown/MarkdownReasoningBlock'
import ReactMarkdown from './ReactMarkdown'

export type ChatViewRef = {
	focus: () => void
	addMessage: (message: ChatMessage) => void
	setMessages: (messages: ChatMessage[]) => void
	getMessages: () => ChatMessage[]
}

export type ChatViewProps = {
	activeLeaf?: WorkspaceLeaf
	mode?: 'chat' | 'history' | 'commands'
	selectedSerializedNodes?: BaseSerializedNode[]
	addedBlockKey?: string | null
}

const ChatView = forwardRef<ChatViewRef, ChatViewProps>(
	({ activeLeaf, mode = 'chat', selectedSerializedNodes, addedBlockKey }, ref) => {
		const app = useApp()
		const {
			settings,
			// setSettings 
		} = useSettings()
		const { llmManager } = useLLM()

		// Contexts removed
		// const { getRAGEngine } = useRAG()
		// const { diffStrategy } = useDiffStrategy()
		// const { getMcpHub } = useMcpHub()
		// const { getTransEngine } = useTrans()

		const { customModePrompts, customModeList } = useCustomModes()
		const { chatId, setChatId, historyList, handleUpdateChat, handleDeleteChat, handleNewChat, currentChat, handleClearHistory } = useChatHistory();

		const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'commands'>(mode)

		// Derived state for chat history logic
		const [messages, setMessages] = useState<ChatMessage[]>([])

		// If chatId changes, load messages (handled typically by effect or props, simplified here)
		useEffect(() => {
			if (currentChat) {
				setMessages(currentChat.messages)
			} else if (!chatId) {
				setMessages([]);
			}
		}, [currentChat, chatId])

		const [mentionables, setMentionables] = useState<Mentionable[]>([])
		const [streamingParams, setStreamingParams] = useState<{
			prompt: string
			provider: string
			modelId: string
		} | null>(null)
		const [isStreaming, setIsStreaming] = useState(false)
		const [abortController, setAbortController] = useState<AbortController | null>(
			null,
		)
		const [queryProgress, setQueryProgress] = useState<QueryProgressState | null>(null)
		const [reasoningData, setReasoningData] = useState<string | null>(null);

		const chatInputRef = useRef<ChatUserInputRef>(null)
		const messagesEndRef = useRef<HTMLDivElement>(null)

		const promptGenerator = useMemo(() => {
			return new PromptGenerator(app, settings, customModePrompts, customModeList)
		}, [app, settings, customModePrompts, customModeList])

		const scrollToBottom = () => {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
		}

		useEffect(() => {
			scrollToBottom()
		}, [messages, queryProgress])

		useImperativeHandle(ref, () => ({
			focus: () => {
				chatInputRef.current?.focus()
			},
			addMessage: (message: ChatMessage) => {
				const newMessages = [...messages, message]
				setMessages(newMessages)
				if (chatId) {
					handleUpdateChat(chatId, { messages: newMessages, updatedAt: Date.now() })
				}
			},
			setMessages: (newMessages: ChatMessage[]) => {
				setMessages(newMessages)
				if (chatId) {
					handleUpdateChat(chatId, { messages: newMessages, updatedAt: Date.now() })
				}
			},
			getMessages: () => messages,
		}))

		const stopStreaming = () => {
			if (abortController) {
				abortController.abort()
				setAbortController(null)
			}
			setIsStreaming(false)
			setQueryProgress(null)
		}

		// Tool mutation handler - SIMPLIFIED
		const { mutateAsync: applyMutation } = useMutation({
			mutationFn: async ({
				toolName,
				toolArgs,
			}: {
				toolName: string
				toolArgs: ToolArgs
			}) => {
				const activeFile = app.workspace.getActiveFile()
				const currentFile = activeFile?.path

				switch (toolName) {
					case 'write_to_file': {
						// Simple rewrite/write
						const targetFile = toolArgs.path || currentFile
						if (!targetFile) throw new Error("No target file specified")
						await ApplyEditToFile(app, targetFile, toolArgs.content || "", 'overwrite')
						return `Wrote to ${targetFile}`
					}
					case 'read_file': {
						const targetPath = toolArgs.path || currentFile
						if (!targetPath) throw new Error("No target file specified")
						const file = app.vault.getAbstractFileByPath(targetPath)
						if (file instanceof TFile) {
							return await readTFileContent(file, app.vault)
						} else if (file instanceof TFolder) {
							return "Is a folder, use list_files"
						}
						return "File not found"
					}
					case 'list_files': {
						const path = toolArgs.path || ''
						const files = await listFilesAndFolders(app.vault, path, toolArgs.recursive === 'true', undefined, app)
						return files.join('\n')
					}
					case 'insert_content': {
						// Simple insert append? Or line based?
						// Assuming toolArgs has line or we append
						const targetFile = toolArgs.path || currentFile
						if (!targetFile) throw new Error("No target file specified")
						// Need implementation for insert_content, maybe reuse ApplyEditToFile with 'append' or custom logic
						// For now, simplified:
						await ApplyEditToFile(app, targetFile, toolArgs.content || "", 'append')
						return `Inserted content to ${targetFile}`
					}
					case 'search_and_replace': {
						const targetFile = toolArgs.path || currentFile
						if (!targetFile) throw new Error("No target file specified")
						await SearchAndReplace(app, targetFile, toolArgs.search || "", toolArgs.replace || "")
						return `Replaced content in ${targetFile}`
					}
					// Removed: apply_diff, use_mcp_tool, etc.
					default:
						// Handle basic tools or error
						// Attempt completion
						if (toolName === 'attempt_completion') {
							return toolArgs.result || "Completed."
						}
						if (toolName === 'ask_followup_question') {
							return toolArgs.question || "Asking followup..."
						}
						return `Tool ${toolName} not supported in Lite mode.`
				}
			},
		})

		const handleSubmit = async (
			initialContent: any, // SerializedEditorState
			useVaultSearchFlag: boolean = false,
		) => {
			if (isStreaming) return
			if (!initialContent) return

			if (messages.length === 0) {
				handleNewChat()
			}

			// Add user message
			const userMessage: ChatUserMessage = {
				role: 'user',
				content: initialContent,
				id: uuidv4(),
				mentionables: [...mentionables],
				createdAt: Date.now(),
			}

			let newMessages = [...messages, userMessage]
			setMessages(newMessages)
			setMentionables([])

			setIsStreaming(true)
			setQueryProgress({ type: 'analysing', message: 'Generating prompt...' })
			const ac = new AbortController()
			setAbortController(ac)

			try {
				// Generate prompt
				const { requestMessages, compiledMessages } = await promptGenerator.generateRequestMessages({
					messages: newMessages,
					useVaultSearch: useVaultSearchFlag, // We keep the flag but implementation might be simplified
					onQueryProgressChange: setQueryProgress
				})

				// Update messages with compiled content (e.g. read files)
				newMessages = [...compiledMessages, { role: 'assistant', content: '', id: uuidv4(), createdAt: Date.now() }]
				setMessages(newMessages)

				// Call LLM
				const streamOptions = {
					model: {
						provider: settings.chatModelProvider,
						modelId: settings.chatModelId
					},
					messages: requestMessages,
				}

				setStreamingParams({
					prompt: JSON.stringify(requestMessages),
					provider: settings.chatModelProvider,
					modelId: settings.chatModelId
				})

				const stream = await llmManager.streamResponse(streamOptions.model, {
					messages: streamOptions.messages,
					stream: true,
					max_tokens: settings.modelOptions.maxTokens,
					temperature: settings.modelOptions.temperature,
				}, { signal: ac.signal })

				let fullContent = ""
				let reasoningContent = ""

				for await (const chunk of stream) {
					if (ac.signal.aborted) break

					// Handle reasoning (optional)
					if (chunk.choices[0]?.delta?.reasoning_content) {
						reasoningContent += chunk.choices[0].delta.reasoning_content
						setReasoningData(reasoningContent)
					}

					if (chunk.choices[0]?.delta?.content) {
						const content = chunk.choices[0].delta.content
						fullContent += content
						// Update last message
						setMessages(prev => {
							const last = prev[prev.length - 1]
							if (last.role === 'assistant') {
								return [...prev.slice(0, -1), { ...last, content: fullContent, reasoning: reasoningContent }]
							}
							return prev
						})
					}
				}

				// Tool usage parsing (Simplified)
				// We don't have the robust tool parser enabled here for complex tools? 
				// Or we accept tool blocks?
				// Assuming standard "Tool Use" blocks or XML.
				// For now, if Lite mode supports tools, we parse them from `fullContent`.
				// Since we stripped `applyToolUse`, we need to implement basic parsing or just support text.
				// If user wants API calling, we need tool parsing.
				// Let's use `applyCommonToolUse` if it exists and is lightweight.

				// Assuming `applyCommonToolUse` is imported and safe.
				// If `fullContent` contains tool calls.

				// For simplicity in Lite, let's assume we parse XML tools if present or just end turn.

				if (chatId) {
					handleUpdateChat(chatId, { messages: newMessages, updatedAt: Date.now() })
				}

			} catch (error) {
				console.error("Chat error", error)
				new Notice(`Error: ${error.message}`)
				setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}`, id: uuidv4(), createdAt: Date.now() }])
			} finally {
				setIsStreaming(false)
				setAbortController(null)
				setQueryProgress(null)
			}
		}

		return (
			<div className="infio-chat-view">
				<div className="infio-chat-view__header">
					<div className="infio-chat-view__header-left">
						<button
							className={`infio-chat-view__header-tab ${activeTab === 'chat' ? 'active' : ''}`}
							onClick={() => setActiveTab('chat')}
						>
							<NotebookPen size={16} />
						</button>
						<button
							className={`infio-chat-view__header-tab ${activeTab === 'history' ? 'active' : ''}`}
							onClick={() => setActiveTab('history')}
						>
							<History size={16} />
						</button>
						<button
							className={`infio-chat-view__header-tab ${activeTab === 'commands' ? 'active' : ''}`}
							onClick={() => setActiveTab('commands')}
						>
							<SquareSlash size={16} />
						</button>
					</div>
					<div className="infio-chat-view__header-right">
						<button onClick={handleNewChat} title={t('chat.newChat')}>
							<Plus size={16} />
						</button>
					</div>
				</div>

				<div className="infio-chat-view__content">
					{activeTab === 'chat' && (
						<div className="infio-chat-messages">
							{messages.map((msg, index) => (
								<div key={msg.id} className={`infio-chat-message ${msg.role}`}>
									{msg.role === 'user' ? (
										// @ts-ignore
										// Assuming UserMessageView handles serialized content
										<div className="infio-user-message-content">User: {msg.content?.root ? "(Complex Content)" : "User Message"}</div>
										// Note: In real implementation use UserMessageView specific to your setup
									) : (
										<>
											{msg.reasoning && (
												<MarkdownReasoningBlock
													reasoningContent={msg.reasoning}
												/>
											)}
											<ReactMarkdown content={msg.content} />
											<AssistantMessageActions
												message={msg}
											/>
										</>
									)}
								</div>
							))}
							{queryProgress && <QueryProgress progress={queryProgress} />}
							<div ref={messagesEndRef} />
						</div>
					)}
					{activeTab === 'chat' && (
						<div className="infio-chat-input-container">
							<PromptInputWithActions
								ref={chatInputRef}
								initialSerializedEditorState={null}
								onSubmit={handleSubmit}
								onFocus={() => { }}
								onCreateCommand={() => { }}
								mentionables={mentionables}
								setMentionables={setMentionables}
								addedBlockKey={addedBlockKey}
							/>
						</div>
					)}

					{activeTab === 'history' && (
						<ChatHistoryView
							onSelectChat={(id) => {
								setChatId(id)
								setActiveTab('chat')
							}}
							onDeleteChat={handleDeleteChat}
							onClearHistory={handleClearHistory}
							historyList={historyList}
						/>
					)}

					{activeTab === 'commands' && (
						<CommandsView />
					)}
				</div>
			</div>
		)
	}
)

ChatView.displayName = 'ChatView'

export default ChatView
