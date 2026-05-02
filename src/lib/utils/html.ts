export function htmlToPlainText(html: string): string {
	if (!html) return '';

	if (typeof DOMParser === 'undefined') {
		return html.replace(/<[^>]*>/g, '').trim();
	}

	const document = new DOMParser().parseFromString(html, 'text/html');
	return (document.body?.textContent ?? '').trim();
}
