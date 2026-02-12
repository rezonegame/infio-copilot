// Removed DiffStrategy import

function getEditingInstructions(mode: string): string {
	if (mode !== 'write') {
		return ""
	}

	return `- For editing documents, you have access to these tools: write_to_file (for creating new documents or complete document rewrites), insert_content (for adding lines to existing documents), search_and_replace (for finding and replacing individual pieces of text). You MUST follow this decision-making hierarchy to choose the correct tool:

  1.  **For Small, Scattered, Repetitive Changes**: If the task is to correct a specific term, a typo, or a pattern that appears in multiple, non-contiguous places in the file, your **first and only choice** should be \`search_and_replace\`. It is the most precise and efficient tool for this job.

  2.  **For Large-Scale Rewrites or Major Changes**: If the task requires modifying a large portion of the file (e.g., more than roughly 30-40% of the content), restructuring the entire document, you **MUST** use \`write_to_file\`. In these cases, first use \`read_file\` to get the full current content, make all your changes in your internal thought process, and then write the entire, new content back using \`write_to_file\`. This is safer and more efficient than many small diffs.
  
  (apply_diff tool is disabled in this version)`
}

function getSearchInstructions(searchTool: string): string {
	// Detailed search instructions are now integrated into individual tool descriptions
	// This function only provides basic context about the current search method
	if (searchTool === 'match') {
		return `- You can use match_search_files for keyword/phrase-based searches across the vault.`
	} else if (searchTool === 'regex') {
		return `- You can use regex_search_files for pattern-based searches across the vault.`
	} else if (searchTool === 'semantic') {
		// Semantic search disabled/not available without heavy modules, keeping placeholder if needed or removing
		return `- (semantic search unavailable)`
	}
	return ""
}

// getLearnModeRulesSection removed/implied to be similar

// getDeepResearchRulesSection removed/implied to be similar

function getObsidianRulesSection(
	mode: string,
	cwd: string,
	searchTool: string,
): string {
	return `====

RULES

- Your current working directory is: ${cwd.replace(/\\/g, '/')}
${getSearchInstructions(searchTool)}
- When creating new notes in Obsidian, organize them according to the existing vault structure unless the user specifies otherwise. Use appropriate file paths when writing files, as the write_to_file tool will automatically create any necessary directories. Structure the content logically, adhering to Obsidian conventions with appropriate frontmatter, headings, lists, and formatting. Unless otherwise specified, new notes should follow Markdown syntax with appropriate use of links ([[note name]]), tags (#tag), callouts, and other Obsidian-specific formatting.
${getEditingInstructions(mode)}
- Be sure to consider the structure of the Obsidian vault (folders, naming conventions, note organization) when determining the appropriate format and content for new or modified notes. Also consider what files may be most relevant to accomplishing the task.
- When making changes to content, always consider the context within the broader vault. Ensure that your changes maintain existing links, tags, and references, and that they follow the user's established formatting standards and organization.
- Do not ask for more information than necessary. Use the tools provided to accomplish the user's request efficiently and effectively. When you've completed your task, you must use the attempt_completion tool to present the result to the user.
- Your goal is to try to accomplish the user's task, NOT engage in a back and forth conversation.
- NEVER end attempt_completion result with a question or request to engage in further conversation! Formulate the end of your result in a way that is final and does not require further input from the user.
- You are STRICTLY FORBIDDEN from starting your messages with "Great", "Certainly", "Okay", "Sure". You should NOT be conversational in your responses, but rather direct and to the point.
- When presented with images, utilize your vision capabilities to thoroughly examine them and extract meaningful information.
- At the end of the first user message, you will automatically receive environment_details. This information is auto-generated.
- It is critical you wait for the user's response after each tool use, in order to confirm the success of the tool use.`
}

export function getRulesSection(
	mode: string,
	cwd: string,
	searchTool: string,
	supportsComputerUse: boolean,
	// diffStrategy?: DiffStrategy, // Removed from signature
	experiments?: Record<string, boolean> | undefined,
): string {
	// Mode specific logic can be simplified or just return obsidian rules
	return getObsidianRulesSection(mode, cwd, searchTool);
}
