/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { NoteUpdateService } from '@/core/NoteUpdateService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	prohibitMoved: true,

	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	kind: 'write:notes',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			updatedNote: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Note',
			},
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '0efb51f3-cb2d-45ee-8c7d-2a57e7c97fd4',
		},

		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'dc01cda1-bebf-425e-9b26-8867d8f8f0b6',
		},

		noSuchFile: {
			message: 'Some files are not found.',
			code: 'NO_SUCH_FILE',
			id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
		},

		containsProhibitedWords: {
			message: 'Cannot post because it contains prohibited words.',
			code: 'CONTAINS_PROHIBITED_WORDS',
			id: 'aa6e01d3-a85c-669d-758a-76aab43af334',
		},

		containsTooManyMentions: {
			message: 'Cannot post because it exceeds the allowed number of mentions.',
			code: 'CONTAINS_TOO_MANY_MENTIONS',
			id: '4de0363a-3046-481b-9b0f-feff3e211025',
		},

		cannotCreateAlreadyExpiredPoll: {
			message: 'Poll is already expired.',
			code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
			id: '04da457d-b083-4055-9082-955525eda5a5',
		},

		noContent: {
			message: 'Note content is required.',
			code: 'NO_CONTENT',
			id: 'f8ce529f-df3f-4c94-b62f-764e084fcf7a',
		},

		cannotEditInPlace: {
			message: 'This note can only be edited in place without changing visibility or targets.',
			code: 'CANNOT_EDIT_IN_PLACE',
			id: 'fbe41b8f-f965-4680-b8c9-457fec2cf177',
		},

		cannotEditPollInPlace: {
			message: 'Polls cannot be edited in place.',
			code: 'CANNOT_EDIT_POLL_IN_PLACE',
			id: '9362dcb1-0a84-4943-b861-95b593f6bfbf',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'], default: 'public' },
		visibleUserIds: { type: 'array', uniqueItems: true, items: {
			type: 'string', format: 'misskey:id',
		} },
		replyLockedText: {
			type: 'string',
			minLength: 1,
			maxLength: MAX_NOTE_TEXT_LENGTH,
			nullable: true,
		},
		cw: { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
		cwReplyRequired: { type: 'boolean', default: false },
		localOnly: { type: 'boolean', default: false },
		reactionAcceptance: { type: 'string', nullable: true, enum: [null, 'likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote'], default: null },
		replyId: { type: 'string', format: 'misskey:id', nullable: true },
		renoteId: { type: 'string', format: 'misskey:id', nullable: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
		text: {
			type: 'string',
			minLength: 1,
			maxLength: MAX_NOTE_TEXT_LENGTH,
			nullable: true,
		},
		fileIds: {
			type: 'array',
			uniqueItems: true,
			minItems: 1,
			maxItems: 18,
			items: { type: 'string', format: 'misskey:id' },
		},
		mediaIds: {
			type: 'array',
			uniqueItems: true,
			minItems: 1,
			maxItems: 18,
			items: { type: 'string', format: 'misskey:id' },
		},
		poll: {
			type: 'object',
			nullable: true,
			properties: {
				choices: {
					type: 'array',
					uniqueItems: true,
					minItems: 2,
					maxItems: 10,
					items: { type: 'string', minLength: 1, maxLength: 50 },
				},
				multiple: { type: 'boolean' },
				expiresAt: { type: 'integer', nullable: true },
				expiredAfter: { type: 'integer', nullable: true, minimum: 1 },
			},
			required: ['choices'],
		},
	},
	required: ['noteId'],
	if: {
		properties: {
			renoteId: {
				type: 'null',
			},
			fileIds: {
				type: 'null',
			},
			mediaIds: {
				type: 'null',
			},
			replyLockedText: {
				type: 'null',
			},
			poll: {
				type: 'null',
			},
		},
	},
	then: {
		properties: {
			text: {
				type: 'string',
				minLength: 1,
				maxLength: MAX_NOTE_TEXT_LENGTH,
				pattern: '[^\\s]+',
			},
		},
		required: ['text'],
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private getterService: GetterService,
		private noteEntityService: NoteEntityService,
		private noteUpdateService: NoteUpdateService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (note.userId !== me.id) {
				throw new ApiError(meta.errors.accessDenied);
			}

			try {
				const updatedNote = await this.noteUpdateService.update(
					await this.usersRepository.findOneByOrFail({ id: me.id }) as MiLocalUser,
					note,
					{
						fileIds: ps.fileIds ?? ps.mediaIds ?? [],
						poll: ps.poll ? {
							choices: ps.poll.choices,
							multiple: ps.poll.multiple ?? false,
							expiresAt: ps.poll.expiredAfter ? new Date(Date.now() + ps.poll.expiredAfter) : ps.poll.expiresAt ? new Date(ps.poll.expiresAt) : null,
						} : null,
						text: ps.text ?? null,
						replyLockedText: ps.replyLockedText ?? null,
						replyId: ps.replyId ?? null,
						renoteId: ps.renoteId ?? null,
						channelId: ps.channelId ?? null,
						cw: ps.cw ?? null,
						cwReplyRequired: ps.cwReplyRequired,
						localOnly: ps.localOnly,
						reactionAcceptance: ps.reactionAcceptance,
						visibility: ps.visibility,
						visibleUserIds: ps.visibleUserIds ?? [],
					},
				);

				return {
					updatedNote: await this.noteEntityService.pack(updatedNote, me),
				};
			} catch (err) {
				if (err instanceof IdentifiableError) {
					if (err.id === '801c046c-5bf5-4234-ad2b-e78fc20a2ac7') {
						throw new ApiError(meta.errors.noSuchFile);
					} else if (err.id === '689ee33f-f97c-479a-ac49-1b9f8140af99') {
						throw new ApiError(meta.errors.containsProhibitedWords);
					} else if (err.id === '9f466dab-c856-48cd-9e65-ff90ff750580') {
						throw new ApiError(meta.errors.containsTooManyMentions);
					} else if (err.id === '0c11c11e-0c8d-48e7-822c-76ccef660068') {
						throw new ApiError(meta.errors.cannotCreateAlreadyExpiredPoll);
					} else if (err.id === '314f9c77-6486-4f23-a9df-f2c454f59b44') {
						throw new ApiError(meta.errors.noContent);
					} else if (err.id === '747719f7-f86f-44df-a321-f5f0b1003cb1') {
						throw new ApiError(meta.errors.cannotEditInPlace);
					} else if (err.id === 'f6a9a78d-1af9-4d1e-a566-bb5d1d6fced1') {
						throw new ApiError(meta.errors.cannotEditPollInPlace);
					}
				}
				throw err;
			}
		});
	}
}
