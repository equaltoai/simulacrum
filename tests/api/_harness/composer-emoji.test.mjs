import assert from 'node:assert/strict';
import test from 'node:test';

import { renderComposerEmojiSelection } from '../../../src/lib/components/composerEmoji.ts';

test('composer inserts custom emoji as a shortcode token', () => {
	assert.equal(renderComposerEmojiSelection({ shortcode: 'blobcat' }), ':blobcat:');
});

test('composer inserts Unicode fallback emoji as Unicode, not malformed shortcodes', () => {
	assert.equal(
		renderComposerEmojiSelection({
			shortcode: '😀',
			isUnicode: true,
			unicode: '😀',
		}),
		'😀'
	);
	assert.equal(
		renderComposerEmojiSelection({
			shortcode: '   ',
			isUnicode: true,
			unicode: '✨',
		}),
		'✨'
	);
});
