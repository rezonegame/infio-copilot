// @ts-nocheck
import { Editor, MarkdownView, Notice, Plugin } from 'obsidian'

import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/ChatView'
import { CHAT_VIEW_TYPE } from './constants'
import { t } from './lang/helpers'
import { InfioSettingTab } from './settings/SettingTab'
import {
	InfioSettings,
	parseInfioSettings,
} from './types/settings'
import { getMentionableBlockData } from './utils/obsidian'
import './utils/path'

type DesktopAugmented = Plugin & {
	settings: InfioSettings
	settingTab: InfioSettingTab
	settingsListeners: ((newSettings: InfioSettings) => void)[]
	initChatProps?: ChatProps

	// methods
	loadSettings: () => Promise<void>
	setSettings: (newSettings: InfioSettings) => Promise<void>
	addSettingsListener: (listener: (newSettings: InfioSettings) => void) => () => void
	openChatView: (openNewChat?: boolean) => Promise<void>
	activateChatView: (chatProps?: ChatProps, openNewChat?: boolean) => Promise<void>
	addSelectionToChat: (editor: Editor, view: MarkdownView) => Promise<void>
	reloadChatView: () => Promise<void>
}

export async function loadDesktop(base: Plugin) {
	const plugin = base as DesktopAugmented
	// initialize fields
	plugin.initChatProps = undefined
	plugin.settingsListeners = []

	// attach methods
	plugin.loadSettings = async function () {
		this.settings = parseInfioSettings(await this.loadData())
		await this.saveData(this.settings)
	}
	plugin.setSettings = async function (newSettings: InfioSettings) {
		this.settings = newSettings
		await this.saveData(newSettings)
		this.settingsListeners.forEach((listener) => listener(newSettings))
	}
	plugin.addSettingsListener = function (listener: (ns: InfioSettings) => void) {
		this.settingsListeners.push(listener)
		return () => {
			this.settingsListeners = this.settingsListeners.filter((l) => l !== listener)
		}
	}
	plugin.openChatView = async function (openNewChat = false) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		const editor = view?.editor
		if (!view || !editor) {
			await this.activateChatView(undefined, openNewChat)
			return
		}
		const selectedBlockData = await getMentionableBlockData(editor, view)
		await this.activateChatView({ selectedBlock: selectedBlockData ?? undefined }, openNewChat)
	}
	plugin.activateChatView = async function (chatProps?: ChatProps, openNewChat = false) {
		this.initChatProps = chatProps
		const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
		await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({ type: CHAT_VIEW_TYPE, active: true })
		if (openNewChat && leaf && leaf.view instanceof ChatView) {
			leaf.view.openNewChat(chatProps?.selectedBlock)
		}
		this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0])
	}
	plugin.addSelectionToChat = async function (editor: Editor, view: MarkdownView) {
		const data = await getMentionableBlockData(editor, view)
		if (!data) return
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
		if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
			await this.activateChatView({ selectedBlock: data })
			return
		}
		await this.app.workspace.revealLeaf(leaves[0])
		const chatView = leaves[0].view
		chatView.addSelectionToChat(data)
		chatView.focusMessage()
	}
	plugin.reloadChatView = async function () {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
		if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) return
		new Notice(t('notifications.reloadingInfio'), 1000)
		leaves[0].detach()
		await this.activateChatView()
	}

	// ==== onload ====
	await plugin.loadSettings()

	plugin.settingTab = new InfioSettingTab(plugin.app, plugin as unknown as any)
	plugin.addSettingTab(plugin.settingTab)

	plugin.addRibbonIcon('wand-sparkles', t('main.openInfioCopilot'), () => plugin.openChatView())

	plugin.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, plugin as unknown as any))

	plugin.addCommand({
		id: 'open-new-chat',
		name: t('main.openNewChat'),
		callback: () => plugin.openChatView(true),
	})

	plugin.addCommand({
		id: 'add-selection-to-chat',
		name: t('main.addSelectionToChat'),
		editorCallback: (editor: Editor, view: MarkdownView) => {
			plugin.addSelectionToChat(editor, view)
		},
	})
}

export function unloadDesktop(base: Plugin) {
	// nothing heavy to clean up anymore
}
