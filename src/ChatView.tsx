// @ts-nocheck
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import Chat, { ChatProps, ChatRef } from './components/chat-view/ChatView'
import { CHAT_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/AppContext'
import { DarkModeProvider } from './contexts/DarkModeContext'
import { DialogProvider } from './contexts/DialogContext'
import { LLMProvider } from './contexts/LLMContext'
import { SettingsProvider } from './contexts/SettingsContext'
import InfioPlugin from './main'
import { MentionableBlockData } from './types/mentionable'
import { InfioSettings } from './types/settings'

export class ChatView extends ItemView {
	private root: Root | null = null
	private settings: InfioSettings
	private initialChatProps?: ChatProps
	private chatRef: React.RefObject<ChatRef> = React.createRef()

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: InfioPlugin,
	) {
		super(leaf)
		// @ts-ignore
		this.settings = plugin.settings
		// @ts-ignore
		this.initialChatProps = plugin.initChatProps
	}

	getViewType() {
		return CHAT_VIEW_TYPE
	}

	getIcon() {
		return 'wand-sparkles'
	}

	getDisplayText() {
		return 'Infio chat'
	}

	async onOpen() {
		await this.render()
		this.initialChatProps = undefined
	}

	async onClose() {
		this.root?.unmount()
	}

	async render() {
		const containerElement = this.containerEl.children[1]
		if (!containerElement || !(containerElement instanceof HTMLElement)) {
			console.error('ChatView: Container element not found or invalid')
			return
		}

		if (!this.root) {
			this.root = createRoot(containerElement)
		}

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 0,
				},
				mutations: {
					gcTime: 0,
				},
			},
		})

		this.root.render(
			<AppProvider app={this.app}>
				<SettingsProvider
					settings={this.settings}
					// @ts-ignore
					setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
					addSettingsChangeListener={(listener) =>
						// @ts-ignore
						this.plugin.addSettingsListener(listener)
					}
				>
					<DarkModeProvider>
						<LLMProvider>
							<QueryClientProvider client={queryClient}>
								<React.StrictMode>
									<DialogProvider
										container={containerElement}
									>
										<Chat ref={this.chatRef} {...this.initialChatProps} />
									</DialogProvider>
								</React.StrictMode>
							</QueryClientProvider>
						</LLMProvider>
					</DarkModeProvider>
				</SettingsProvider>
			</AppProvider>,
		)
	}

	openNewChat(selectedBlock?: MentionableBlockData) {
		this.chatRef.current?.openNewChat(selectedBlock)
	}

	addSelectionToChat(selectedBlock: MentionableBlockData) {
		this.chatRef.current?.addSelectionToChat(selectedBlock)
	}

	focusMessage() {
		this.chatRef.current?.focusMessage()
	}
}
