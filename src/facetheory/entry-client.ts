import { hydrate, mount } from 'svelte';

import App from './App.svelte';
import { readClientProps } from './dev';
import './styles.css';

const props = readClientProps();
const devTarget = document.getElementById('app');

if (devTarget) {
	mount(App, {
		target: devTarget,
		props,
	});
} else {
	hydrate(App, {
		target: document.body,
		props,
	});
}
