<script lang="ts">
	import defaultAvatar from '$lib/greater/primitives/assets/greater-default-profile.png';

	interface Props {
		src?: string | null;
		alt?: string;
		class?: string;
		width?: number | string;
		height?: number | string;
		loading?: HTMLImageElement['loading'];
		decoding?: HTMLImageElement['decoding'];
	}

	let {
		src,
		alt = '',
		class: className = '',
		width,
		height,
		loading = 'lazy',
		decoding = 'async',
	}: Props = $props();

	const resolvedSrc = $derived.by(() => (src && src.trim().length > 0 ? src : defaultAvatar));
	let lastResolvedSrc = $state<string | null>(null);
	let fallbackApplied = $state(false);

	$effect(() => {
		if (resolvedSrc === lastResolvedSrc) return;
		lastResolvedSrc = resolvedSrc;
		fallbackApplied = false;
	});

	function handleError(event: Event) {
		if (fallbackApplied) return;
		fallbackApplied = true;
		const image = event.currentTarget as HTMLImageElement;
		image.src = defaultAvatar;
	}
</script>

<img
	src={resolvedSrc}
	{alt}
	class={className}
	{width}
	{height}
	{loading}
	{decoding}
	onerror={handleError}
/>
