import {
	App,
	PluginSettingTab,
	Setting,
} from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";

import { t } from '../lang/helpers';
import { InfioSettings } from '../types/settings';

// import AdvancedSettings from './components/AdvancedSettings';
// import BasicAutoCompleteSettings from './components/BasicAutoCompleteSettings';
// import DangerZoneSettings from './components/DangerZoneSettings';
import CustomProviderSettings from './components/ModelProviderSettings';
import PluginInfoSettings from './components/PluginInfoSettings';
// import PostprocessingSettings from './components/PostprocessingSettings';
// import PreprocessingSettings from './components/PreprocessingSettings';
// import PrivacySettings from './components/PrivacySettings';
// import TriggerSettingsSection from './components/TriggerSettingsSection';

type InfioPluginLike = Plugin & {
	settings: InfioSettings;
	setSettings: (s: InfioSettings) => Promise<void>;
}

export class InfioSettingTab extends PluginSettingTab {
	plugin: InfioPluginLike;
	private modelsContainer: HTMLElement | null = null;
	private pluginInfoContainer: HTMLElement | null = null;

	constructor(app: App, plugin: InfioPluginLike) {
		// @ts-ignore
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()
		this.renderPluginInfoSection(containerEl)
		this.renderModelsSection(containerEl)
		this.renderModelParametersSection(containerEl)
		// this.renderFilesSearchSection(containerEl) // Removed
		this.renderChatBehaviorSection(containerEl)
		// this.renderDeepResearchSection(containerEl) // Removed
		// this.renderRAGSection(containerEl) // Removed
		// this.renderAutoCompleteSection(containerEl) // Removed
	}

	private renderModelsContent(containerEl: HTMLElement): void {
		const div = containerEl.createDiv("div");
		const sections = createRoot(div);
		sections.render(
			<CustomProviderSettings
				// @ts-ignore
				plugin={this.plugin}
				onSettingsUpdate={() => {
					if (this.modelsContainer) {
						this.modelsContainer.empty();
						this.renderModelsContent(this.modelsContainer);
					}
				}}
			/>
		);
	}

	private renderModelParametersSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setHeading().setName(t('settings.ModelParameters.title'));
		new Setting(containerEl)
			.setName(t('settings.ModelParameters.temperature'))
			.setDesc(t('settings.ModelParameters.temperatureDescription'))
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.modelOptions.temperature))
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							modelOptions: {
								...this.plugin.settings.modelOptions,
								temperature: parseFloat(value),
							},
						});
					})
			});
		new Setting(containerEl)
			.setName(t('settings.ModelParameters.topP'))
			.setDesc(t('settings.ModelParameters.topPDescription'))
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.modelOptions.top_p))
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							modelOptions: {
								...this.plugin.settings.modelOptions,
								top_p: parseFloat(value),
							},
						});
					})
			});
		new Setting(containerEl)
			.setName(t('settings.ModelParameters.frequencyPenalty'))
			.setDesc(t('settings.ModelParameters.frequencyPenaltyDescription'))
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.modelOptions.frequency_penalty))
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							modelOptions: {
								...this.plugin.settings.modelOptions,
								frequency_penalty: parseFloat(value),
							},
						});
					})
			});
		new Setting(containerEl)
			.setName(t('settings.ModelParameters.presencePenalty'))
			.setDesc(t('settings.ModelParameters.presencePenaltyDescription'))
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.modelOptions.presence_penalty))
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							modelOptions: {
								...this.plugin.settings.modelOptions,
								presence_penalty: parseFloat(value),
							},
						});
					})
			});
		new Setting(containerEl)
			.setName(t('settings.ModelParameters.maxTokens'))
			.setDesc(t('settings.ModelParameters.maxTokensDescription'))
			.addText((text) => {
				text
					.setValue(String(this.plugin.settings.modelOptions.max_tokens))
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							modelOptions: {
								...this.plugin.settings.modelOptions,
								max_tokens: parseInt(value),
							},
						});
					})
			});
	}

	private renderChatBehaviorSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setHeading().setName(t('settings.ChatBehavior.title'));
		new Setting(containerEl)
			.setName(t('settings.ChatBehavior.defaultMention'))
			.setDesc(t('settings.ChatBehavior.defaultMentionDescription'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('none', t('settings.ChatBehavior.none'))
					.addOption('current-file', t('settings.ChatBehavior.currentFile'))
					.addOption('vault', t('settings.ChatBehavior.vault'))
					.setValue(this.plugin.settings.defaultMention || 'none')
					.onChange(async (value) => {
						await this.plugin.setSettings({
							...this.plugin.settings,
							defaultMention: value as 'none' | 'current-file' | 'vault',
						});
					}),
			);
	}

	renderPluginInfoSection(containerEl: HTMLElement): void {
		const pluginInfoDiv = containerEl.createDiv("plugin-info-section");
		this.pluginInfoContainer = pluginInfoDiv;
		this.renderPluginInfoContent(pluginInfoDiv);
	}

	renderModelsSection(containerEl: HTMLElement): void {
		const modelsDiv = containerEl.createDiv("models-section");
		this.modelsContainer = modelsDiv;
		this.renderModelsContent(modelsDiv);
	}

	private renderPluginInfoContent(containerEl: HTMLElement): void {
		const div = containerEl.createDiv("div");
		const root = createRoot(div);
		root.render(
			<PluginInfoSettings
				// @ts-ignore
				pluginVersion={this.plugin.manifest.version}
				// @ts-ignore
				author={this.plugin.manifest.author}
				// @ts-ignore
				authorUrl={this.plugin.manifest.authorUrl}
				// @ts-ignore
				plugin={this.plugin}
				settings={this.plugin.settings}
			/>
		);
	}
}
