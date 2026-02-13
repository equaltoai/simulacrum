export class SkipTestError extends Error {
	constructor(message) {
		super(message);
		this.name = 'SkipTestError';
	}
}

