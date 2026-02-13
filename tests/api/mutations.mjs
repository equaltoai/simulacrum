import { assertEqual, assertOk } from './_harness/assert.mjs';
import { SkipTestError } from './_harness/skip.mjs';

function requireWriteMode(write) {
	if (!write) throw new SkipTestError('Write mode required (pass --write)');
}

function assertGraphqlOk(res, message) {
	assertEqual(res.status, 200, message ?? 'Expected POST /api/graphql to return 200');
	if (Array.isArray(res.body?.errors) && res.body.errors.length) {
		const first = res.body.errors?.[0]?.message;
		throw new Error(`GraphQL returned errors (${res.body.errors.length})${first ? `: ${first}` : ''}`);
	}
}

const CREATE_NOTE_MUTATION = `mutation CreateNote($input: CreateNoteInput!) {
  createNote(input: $input) {
    object { id visibility }
  }
}`;

const OBJECT_STATE_QUERY = `query ObjectState($id: ID!) {
  object(id: $id) {
    id
    visibility
    viewerFavourited
    viewerBookmarked
    boosted
  }
}`;

const DELETE_OBJECT_MUTATION = `mutation DeleteObject($id: ID!) {
  deleteObject(id: $id)
}`;

const LIKE_OBJECT_MUTATION = `mutation LikeObject($id: ID!) {
  likeObject(id: $id) { id type }
}`;

const UNLIKE_OBJECT_MUTATION = `mutation UnlikeObject($id: ID!) {
  unlikeObject(id: $id)
}`;

const BOOKMARK_OBJECT_MUTATION = `mutation BookmarkObject($id: ID!) {
  bookmarkObject(id: $id) { id viewerBookmarked }
}`;

const UNBOOKMARK_OBJECT_MUTATION = `mutation UnbookmarkObject($id: ID!) {
  unbookmarkObject(id: $id)
}`;

const SHARE_OBJECT_MUTATION = `mutation ShareObject($id: ID!) {
  shareObject(id: $id) { id }
}`;

const UNSHARE_OBJECT_MUTATION = `mutation UnshareObject($id: ID!) {
  unshareObject(id: $id) { id }
}`;

async function createTempNote({ gql, evidence }) {
	const content = `api-test ${evidence.meta.runId} ${new Date().toISOString()}`;

	const res = await gql('create_note', {
		query: CREATE_NOTE_MUTATION,
		operationName: 'CreateNote',
		variables: { input: { content, visibility: 'UNLISTED' } },
	});

	assertGraphqlOk(res, 'Expected createNote to succeed');
	const id = res.body?.data?.createNote?.object?.id;
	const visibility = res.body?.data?.createNote?.object?.visibility;

	assertOk(typeof id === 'string' && id.length > 0, 'Expected createNote.object.id');
	assertEqual(visibility, 'UNLISTED', 'Expected createNote visibility to be UNLISTED');

	return { id };
}

async function fetchObjectState({ gql, id }) {
	const res = await gql('object_state', {
		query: OBJECT_STATE_QUERY,
		operationName: 'ObjectState',
		variables: { id },
	});

	assertGraphqlOk(res, 'Expected object state query to succeed');
	return res.body?.data?.object ?? null;
}

async function deleteObject({ gql, id }) {
	const res = await gql('delete_object', {
		query: DELETE_OBJECT_MUTATION,
		operationName: 'DeleteObject',
		variables: { id },
	});

	assertGraphqlOk(res, 'Expected deleteObject to succeed');
	assertEqual(Boolean(res.body?.data?.deleteObject), true, 'Expected deleteObject to return true');
}

async function safeCleanupStep({ evidence, label, step, cleanupErrors }) {
	try {
		await step();
		evidence.note(`cleanup: ${label}: ok`);
	} catch (error) {
		evidence.note(`cleanup: ${label}: failed (${error?.message ?? String(error)})`);
		cleanupErrors.push(error);
	}
}

export default [
	{
		slug: 'gql.write.create_note_delete',
		name: 'GraphQL (write): createNote(UNLISTED) then deleteObject',
		tags: ['graphql', 'write', 'mutation'],
		requiresAuth: true,
		async run({ gql, evidence, write }) {
			requireWriteMode(write);

			let noteId = null;
			let ok = false;
			const cleanupErrors = [];

			try {
				const created = await createTempNote({ gql, evidence });
				noteId = created.id;

				const state = await fetchObjectState({ gql, id: noteId });
				assertOk(state?.id, 'Expected note to be queryable after createNote');
				assertEqual(state.visibility, 'UNLISTED', 'Expected note visibility to remain UNLISTED');

				ok = true;
			} finally {
				if (noteId) {
					await safeCleanupStep({
						evidence,
						label: 'deleteObject',
						cleanupErrors,
						step: async () => {
							await deleteObject({ gql, id: noteId });
							const after = await fetchObjectState({ gql, id: noteId });
							assertEqual(after, null, 'Expected object to be null after deletion');
						},
					});
				}

				if (ok && cleanupErrors.length) {
					throw new Error(`Cleanup failed: ${cleanupErrors[0]?.message ?? String(cleanupErrors[0])}`);
				}
			}
		},
	},
	{
		slug: 'gql.write.like_unlike',
		name: 'GraphQL (write): likeObject then unlikeObject (self-cleaning)',
		tags: ['graphql', 'write', 'mutation'],
		requiresAuth: true,
		async run({ gql, evidence, write }) {
			requireWriteMode(write);

			let noteId = null;
			let liked = false;
			let ok = false;
			const cleanupErrors = [];

			try {
				const created = await createTempNote({ gql, evidence });
				noteId = created.id;

				const before = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(before?.viewerFavourited), false, 'Expected viewerFavourited to start false');

				const likeRes = await gql('like_object', {
					query: LIKE_OBJECT_MUTATION,
					operationName: 'LikeObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(likeRes, 'Expected likeObject to succeed');
				liked = true;

				const afterLike = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterLike?.viewerFavourited), true, 'Expected viewerFavourited to be true after like');

				const unlikeRes = await gql('unlike_object', {
					query: UNLIKE_OBJECT_MUTATION,
					operationName: 'UnlikeObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(unlikeRes, 'Expected unlikeObject to succeed');
				assertEqual(Boolean(unlikeRes.body?.data?.unlikeObject), true, 'Expected unlikeObject to return true');
				liked = false;

				const afterUnlike = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterUnlike?.viewerFavourited), false, 'Expected viewerFavourited to be false after unlike');

				ok = true;
			} finally {
				if (noteId) {
					if (liked) {
						await safeCleanupStep({
							evidence,
							label: 'unlikeObject',
							cleanupErrors,
							step: async () => {
								await gql('cleanup_unlike', {
									query: UNLIKE_OBJECT_MUTATION,
									operationName: 'UnlikeObject',
									variables: { id: noteId },
								});
							},
						});
					}

					await safeCleanupStep({
						evidence,
						label: 'deleteObject',
						cleanupErrors,
						step: async () => {
							await deleteObject({ gql, id: noteId });
						},
					});
				}

				if (ok && cleanupErrors.length) {
					throw new Error(`Cleanup failed: ${cleanupErrors[0]?.message ?? String(cleanupErrors[0])}`);
				}
			}
		},
	},
	{
		slug: 'gql.write.bookmark_unbookmark',
		name: 'GraphQL (write): bookmarkObject then unbookmarkObject (self-cleaning)',
		tags: ['graphql', 'write', 'mutation'],
		requiresAuth: true,
		async run({ gql, evidence, write }) {
			requireWriteMode(write);

			let noteId = null;
			let bookmarked = false;
			let ok = false;
			const cleanupErrors = [];

			try {
				const created = await createTempNote({ gql, evidence });
				noteId = created.id;

				const before = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(before?.viewerBookmarked), false, 'Expected viewerBookmarked to start false');

				const bookmarkRes = await gql('bookmark_object', {
					query: BOOKMARK_OBJECT_MUTATION,
					operationName: 'BookmarkObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(bookmarkRes, 'Expected bookmarkObject to succeed');
				bookmarked = true;

				const afterBookmark = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterBookmark?.viewerBookmarked), true, 'Expected viewerBookmarked to be true after bookmark');

				const unbookmarkRes = await gql('unbookmark_object', {
					query: UNBOOKMARK_OBJECT_MUTATION,
					operationName: 'UnbookmarkObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(unbookmarkRes, 'Expected unbookmarkObject to succeed');
				assertEqual(Boolean(unbookmarkRes.body?.data?.unbookmarkObject), true, 'Expected unbookmarkObject to return true');
				bookmarked = false;

				const afterUnbookmark = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterUnbookmark?.viewerBookmarked), false, 'Expected viewerBookmarked to be false after unbookmark');

				ok = true;
			} finally {
				if (noteId) {
					if (bookmarked) {
						await safeCleanupStep({
							evidence,
							label: 'unbookmarkObject',
							cleanupErrors,
							step: async () => {
								await gql('cleanup_unbookmark', {
									query: UNBOOKMARK_OBJECT_MUTATION,
									operationName: 'UnbookmarkObject',
									variables: { id: noteId },
								});
							},
						});
					}

					await safeCleanupStep({
						evidence,
						label: 'deleteObject',
						cleanupErrors,
						step: async () => {
							await deleteObject({ gql, id: noteId });
						},
					});
				}

				if (ok && cleanupErrors.length) {
					throw new Error(`Cleanup failed: ${cleanupErrors[0]?.message ?? String(cleanupErrors[0])}`);
				}
			}
		},
	},
	{
		slug: 'gql.write.share_unshare',
		name: 'GraphQL (write): shareObject then unshareObject (self-cleaning)',
		tags: ['graphql', 'write', 'mutation'],
		requiresAuth: true,
		async run({ gql, evidence, write }) {
			requireWriteMode(write);

			let noteId = null;
			let shared = false;
			let ok = false;
			const cleanupErrors = [];

			try {
				const created = await createTempNote({ gql, evidence });
				noteId = created.id;

				const before = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(before?.boosted), false, 'Expected boosted to start false');

				const shareRes = await gql('share_object', {
					query: SHARE_OBJECT_MUTATION,
					operationName: 'ShareObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(shareRes, 'Expected shareObject to succeed');
				shared = true;

				const afterShare = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterShare?.boosted), true, 'Expected boosted to be true after share');

				const unshareRes = await gql('unshare_object', {
					query: UNSHARE_OBJECT_MUTATION,
					operationName: 'UnshareObject',
					variables: { id: noteId },
				});
				assertGraphqlOk(unshareRes, 'Expected unshareObject to succeed');
				shared = false;

				const afterUnshare = await fetchObjectState({ gql, id: noteId });
				assertEqual(Boolean(afterUnshare?.boosted), false, 'Expected boosted to be false after unshare');

				ok = true;
			} finally {
				if (noteId) {
					if (shared) {
						await safeCleanupStep({
							evidence,
							label: 'unshareObject',
							cleanupErrors,
							step: async () => {
								await gql('cleanup_unshare', {
									query: UNSHARE_OBJECT_MUTATION,
									operationName: 'UnshareObject',
									variables: { id: noteId },
								});
							},
						});
					}

					await safeCleanupStep({
						evidence,
						label: 'deleteObject',
						cleanupErrors,
						step: async () => {
							await deleteObject({ gql, id: noteId });
						},
					});
				}

				if (ok && cleanupErrors.length) {
					throw new Error(`Cleanup failed: ${cleanupErrors[0]?.message ?? String(cleanupErrors[0])}`);
				}
			}
		},
	},
];

