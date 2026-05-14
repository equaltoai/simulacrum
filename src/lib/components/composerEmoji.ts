export interface ComposerEmojiSelection {
	shortcode: string;
	isUnicode?: boolean;
	unicode?: string;
}

export function renderComposerEmojiSelection(emoji: ComposerEmojiSelection): string {
	if (emoji.isUnicode) {
		const unicode = emoji.unicode?.trim() || emoji.shortcode.trim();
		return unicode;
	}

	const shortcode = emoji.shortcode.trim();
	return shortcode ? `:${shortcode}:` : '';
}
