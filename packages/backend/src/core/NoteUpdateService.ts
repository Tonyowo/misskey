/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { Brackets, DataSource, In, IsNull, Not } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { extractMentions } from '@/misc/extract-mentions.js';
import { extractCustomEmojisFromMfm } from '@/misc/extract-custom-emojis-from-mfm.js';
import { extractHashtags } from '@/misc/extract-hashtags.js';
import { DB_MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { DI } from '@/di-symbols.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { IMentionedRemoteUsers } from '@/models/Note.js';
import { MiNote } from '@/models/Note.js';
import type { IPoll } from '@/models/Poll.js';
import { MiPoll } from '@/models/Poll.js';
import type { DriveFilesRepository, MiMeta, NotesRepository, PollsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { RelayService } from '@/core/RelayService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RoleService } from '@/core/RoleService.js';
import { SearchService } from '@/core/SearchService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

@Injectable()
export class NoteUpdateService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		private noteEntityService: NoteEntityService,
		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private remoteUserResolveService: RemoteUserResolveService,
		private roleService: RoleService,
		private searchService: SearchService,
		private utilityService: UtilityService,
	) {}

	@bindThis
	public async update(user: MiLocalUser, note: MiNote, data: {
		fileIds: MiDriveFile['id'][];
		text: string | null;
		replyLockedText: string | null;
		cw: string | null;
		cwReplyRequired: boolean;
		reactionAcceptance: MiNote['reactionAcceptance'];
		poll: IPoll | null;
		replyId: MiNote['id'] | null;
		renoteId: MiNote['id'] | null;
		channelId: MiNote['channelId'];
		visibility: MiNote['visibility'];
		visibleUserIds: MiUser['id'][];
		localOnly: boolean;
	}): Promise<MiNote> {
		this.assertImmutableFields(note, data);

		let files: MiDriveFile[] = [];
		if (data.fileIds.length > 0) {
			files = await this.driveFilesRepository.createQueryBuilder('file')
				.where('file.userId = :userId AND file.id IN (:...fileIds)', {
					userId: user.id,
					fileIds: data.fileIds,
				})
				.orderBy('array_position(ARRAY[:...fileIds], "id"::text)')
				.setParameters({ fileIds: data.fileIds })
				.getMany();

			if (files.length !== data.fileIds.length) {
				throw new IdentifiableError('801c046c-5bf5-4234-ad2b-e78fc20a2ac7', 'No such file');
			}
		}

		if (data.poll?.expiresAt != null && data.poll.expiresAt.getTime() < Date.now()) {
			throw new IdentifiableError('0c11c11e-0c8d-48e7-822c-76ccef660068', 'Poll expiration must be future time');
		}

		const currentPoll = note.hasPoll ? await this.pollsRepository.findOneBy({ noteId: note.id }) : null;
		if (!this.isPollUnchanged(currentPoll, data.poll)) {
			throw new IdentifiableError('f6a9a78d-1af9-4d1e-a566-bb5d1d6fced1', 'Poll cannot be edited in place');
		}

		const normalized = this.normalizeContent(note, data, files.length > 0, currentPoll != null);
		const hasProhibitedWords = this.checkProhibitedWordsContain({
			cw: normalized.cw,
			text: normalized.text,
			pollChoices: currentPoll?.choices,
			others: normalized.replyLockedText ? [normalized.replyLockedText] : undefined,
		});
		if (hasProhibitedWords) {
			throw new IdentifiableError('689ee33f-f97c-479a-ac49-1b9f8140af99', 'Note contains prohibited words');
		}

		const tags = this.extractTags(normalized, currentPoll);
		const emojis = this.extractEmojis(normalized, currentPoll, user.host);
		const mentionedUsers = await this.extractMentionedUsers(user, normalized, note, currentPoll);

		if (mentionedUsers.length > (await this.roleService.getUserPolicies(user.id)).mentionLimit) {
			throw new IdentifiableError('9f466dab-c856-48cd-9e65-ff90ff750580', 'Note contains too many mentions');
		}

		const mentionedRemoteUsers = await this.buildMentionedRemoteUsers(mentionedUsers);
		const nextFileIds = files.map(file => file.id);
		const nextAttachedFileTypes = files.map(file => file.type);
		const nextMentionIds = mentionedUsers.map(u => u.id);
		const nextMentionedRemoteUsers = JSON.stringify(mentionedRemoteUsers);
		const nextTags = tags.map(tag => normalizeForSearch(tag));
		const didChange =
			note.text !== normalized.text ||
			note.replyLockedText !== normalized.replyLockedText ||
			note.cw !== normalized.cw ||
			note.cwReplyRequired !== normalized.cwReplyRequired ||
			!this.sameIds(note.fileIds, nextFileIds) ||
			!this.sameIds(note.attachedFileTypes, nextAttachedFileTypes) ||
			!this.sameIds(note.mentions, nextMentionIds) ||
			note.mentionedRemoteUsers !== nextMentionedRemoteUsers ||
			!this.sameIds(note.tags, nextTags) ||
			!this.sameIds(note.emojis, emojis) ||
			note.reactionAcceptance !== normalized.reactionAcceptance;

		if (!didChange) {
			return note;
		}

		const updatedAt = new Date();

		await this.db.transaction(async transactionalEntityManager => {
			await transactionalEntityManager.update(MiNote, {
				id: note.id,
				userId: user.id,
			}, {
				text: normalized.text,
				updatedAt,
				replyLockedText: normalized.replyLockedText,
				cw: normalized.cw,
				cwReplyRequired: normalized.cwReplyRequired,
				fileIds: nextFileIds,
				attachedFileTypes: nextAttachedFileTypes,
				mentions: nextMentionIds,
				mentionedRemoteUsers: nextMentionedRemoteUsers,
				tags: nextTags,
				emojis,
				reactionAcceptance: normalized.reactionAcceptance,
			});

			if (currentPoll) {
				await transactionalEntityManager.update(MiPoll, {
					noteId: note.id,
				}, {
					choices: currentPoll.choices,
					multiple: currentPoll.multiple,
					expiresAt: currentPoll.expiresAt,
				});
			}
		});

		const updatedNote = await this.notesRepository.findOneByOrFail({ id: note.id });

		this.searchService.unindexNote(note);
		this.searchService.indexNote(updatedNote);

		const packedUpdatedNote = await this.noteEntityService.pack(updatedNote, user, {
			skipHide: true,
			withReactionAndUserPairCache: true,
		});
		this.globalEventService.publishNoteStream(updatedNote, 'updated', packedUpdatedNote);

		if (!updatedNote.localOnly) {
			const content = this.apRendererService.addContext(
				this.apRendererService.renderUpdate(await this.apRendererService.renderNote(updatedNote, false), user),
			);
			this.deliverToConcerned(user, updatedNote, content);
		}

		return updatedNote;
	}

	@bindThis
	private assertImmutableFields(note: MiNote, data: {
		replyId: MiNote['id'] | null;
		renoteId: MiNote['id'] | null;
		channelId: MiNote['channelId'];
		visibility: MiNote['visibility'];
		visibleUserIds: MiUser['id'][];
		localOnly: boolean;
	}) {
		if (note.replyId !== data.replyId) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Reply target cannot be edited in place');
		}
		if (note.renoteId !== data.renoteId) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Renote target cannot be edited in place');
		}
		if (note.channelId !== data.channelId) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Channel cannot be edited in place');
		}
		if (note.visibility !== data.visibility) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Visibility cannot be edited in place');
		}
		if (note.localOnly !== data.localOnly) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Local-only state cannot be edited in place');
		}
		if (!this.sameIds(note.visibleUserIds, data.visibleUserIds)) {
			throw new IdentifiableError('747719f7-f86f-44df-a321-f5f0b1003cb1', 'Visible users cannot be edited in place');
		}
	}

	@bindThis
	private normalizeContent(note: MiNote, data: {
		text: string | null;
		replyLockedText: string | null;
		cw: string | null;
		cwReplyRequired: boolean;
		reactionAcceptance: MiNote['reactionAcceptance'];
	}, hasFiles: boolean, hasPoll: boolean) {
		let text = data.text;
		let replyLockedText = data.replyLockedText;
		let cw = data.cw;
		let cwReplyRequired = data.cwReplyRequired;

		if (note.replyId != null || note.renoteId != null) {
			cwReplyRequired = false;
		}
		if (!cwReplyRequired) {
			replyLockedText = null;
		}

		if (text) {
			if (text.length > DB_MAX_NOTE_TEXT_LENGTH) {
				text = text.slice(0, DB_MAX_NOTE_TEXT_LENGTH);
			}
			text = text.trim();
			if (text === '') {
				text = null;
			}
		} else {
			text = null;
		}

		if (replyLockedText) {
			if (replyLockedText.length > DB_MAX_NOTE_TEXT_LENGTH) {
				replyLockedText = replyLockedText.slice(0, DB_MAX_NOTE_TEXT_LENGTH);
			}
			replyLockedText = replyLockedText.trim();
			if (replyLockedText === '') {
				replyLockedText = null;
			}
		} else {
			replyLockedText = null;
		}

		if (cwReplyRequired && replyLockedText != null) {
			if (text != null && cw == null) {
				cw = text;
			}
			text = replyLockedText;
			replyLockedText = null;
		}

		if (text == null && replyLockedText == null && !hasPoll && !hasFiles && note.renoteId == null) {
			throw new IdentifiableError('314f9c77-6486-4f23-a9df-f2c454f59b44', 'Note has no content');
		}

		return {
			text,
			replyLockedText,
			cw,
			cwReplyRequired,
			reactionAcceptance: data.reactionAcceptance,
		};
	}

	@bindThis
	private extractTags(
		content: {
			text: string | null;
			replyLockedText: string | null;
			cw: string | null;
		},
		poll: MiPoll | null,
	) {
		const combinedTokens = this.parseTokens(content, poll);
		return extractHashtags(combinedTokens)
			.filter(tag => Array.from(tag).length <= 128)
			.splice(0, 32);
	}

	@bindThis
	private extractEmojis(
		content: {
			text: string | null;
			replyLockedText: string | null;
			cw: string | null;
		},
		poll: MiPoll | null,
		host: MiUser['host'],
	) {
		if (this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, host)) {
			return [];
		}

		return extractCustomEmojisFromMfm(this.parseTokens(content, poll));
	}

	@bindThis
	private parseTokens(
		content: {
			text: string | null;
			replyLockedText: string | null;
			cw: string | null;
		},
		poll: MiPoll | null,
	) {
		const tokens = content.text ? mfm.parse(content.text) : [];
		const replyLockedTokens = content.replyLockedText ? mfm.parse(content.replyLockedText) : [];
		const cwTokens = content.cw ? mfm.parse(content.cw) : [];
		const choiceTokens = poll?.choices
			? poll.choices.flatMap(choice => mfm.parse(choice))
			: [];

		return tokens.concat(replyLockedTokens).concat(cwTokens).concat(choiceTokens);
	}

	@bindThis
	private async extractMentionedUsers(
		user: { host: MiUser['host']; id: MiUser['id']; },
		content: {
			text: string | null;
			replyLockedText: string | null;
			cw: string | null;
		},
		note: MiNote,
		poll: MiPoll | null,
	): Promise<MiUser[]> {
		const mentions = extractMentions(this.parseTokens(content, poll));
		let mentionedUsers = (await Promise.all(mentions.map(m =>
			this.remoteUserResolveService.resolveUser(m.username, m.host ?? user.host).catch(() => null),
		))).filter((x): x is MiLocalUser | MiRemoteUser => x != null);

		mentionedUsers = mentionedUsers.filter((mentionedUser, index, self) =>
			index === self.findIndex(userCandidate => userCandidate.id === mentionedUser.id),
		);

		if (note.replyUserId && note.replyUserId !== user.id && !mentionedUsers.some(x => x.id === note.replyUserId)) {
			mentionedUsers.push(await this.usersRepository.findOneByOrFail({ id: note.replyUserId }) as MiLocalUser | MiRemoteUser);
		}

		if (note.visibility === 'specified') {
			for (const visibleUserId of note.visibleUserIds) {
				if (!mentionedUsers.some(x => x.id === visibleUserId)) {
					mentionedUsers.push(await this.usersRepository.findOneByOrFail({ id: visibleUserId }) as MiLocalUser | MiRemoteUser);
				}
			}
		}

		return mentionedUsers;
	}

	@bindThis
	private async buildMentionedRemoteUsers(mentionedUsers: MiUser[]): Promise<IMentionedRemoteUsers> {
		if (mentionedUsers.length === 0) return [];

		const remoteMentionedUsers = mentionedUsers.filter(user => this.userEntityService.isRemoteUser(user));
		if (remoteMentionedUsers.length === 0) return [];

		const profiles = await this.userProfilesRepository.findBy({
			userId: In(remoteMentionedUsers.map(user => user.id)),
		});

		return remoteMentionedUsers.map(user => {
			const profile = profiles.find(p => p.userId === user.id);
			return {
				uri: user.uri,
				url: profile?.url ?? undefined,
				username: user.username,
				host: user.host,
			};
		});
	}

	@bindThis
	private isPollUnchanged(currentPoll: MiPoll | null, nextPoll: IPoll | null) {
		if ((currentPoll == null) !== (nextPoll == null)) {
			return false;
		}

		if (currentPoll == null && nextPoll == null) {
			return true;
		}

		if (currentPoll == null || nextPoll == null) {
			return false;
		}

		const currentExpiresAt = currentPoll.expiresAt?.getTime() ?? null;
		const nextExpiresAt = nextPoll.expiresAt?.getTime() ?? null;

		return currentPoll.multiple === nextPoll.multiple &&
			currentExpiresAt === nextExpiresAt &&
			currentPoll.choices.length === nextPoll.choices.length &&
			currentPoll.choices.every((choice, index) => choice === nextPoll.choices[index]);
	}

	@bindThis
	private sameIds(a: string[], b: string[]) {
		if (a.length !== b.length) return false;
		return a.every((id, index) => id === b[index]);
	}

	@bindThis
	private checkProhibitedWordsContain(content: Parameters<UtilityService['concatNoteContentsForKeyWordCheck']>[0], prohibitedWords?: string[]) {
		const effectiveProhibitedWords = prohibitedWords ?? this.meta.prohibitedWords;

		return this.utilityService.isKeyWordIncluded(
			this.utilityService.concatNoteContentsForKeyWordCheck(content),
			effectiveProhibitedWords,
		);
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		const where = [] as Record<string, unknown>[];
		const mentionedRemoteUsers = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);

		if (mentionedRemoteUsers.length > 0) {
			where.push({ uri: In(mentionedRemoteUsers) });
		}

		if (note.renoteUserId) {
			where.push({ id: note.renoteUserId });
		}

		if (where.length === 0) return [];

		return await this.usersRepository.find({ where }) as MiRemoteUser[];
	}

	@bindThis
	private async getRenotedOrRepliedRemoteUsers(note: MiNote) {
		const notes = await this.notesRepository.createQueryBuilder('note')
			.leftJoinAndSelect('note.user', 'user')
			.where(new Brackets(qb => {
				qb.orWhere('note.renoteId = :renoteId', { renoteId: note.id });
				qb.orWhere('note.replyId = :replyId', { replyId: note.id });
			}))
			.andWhere({ userHost: Not(IsNull()) })
			.getMany() as (MiNote & { user: MiRemoteUser })[];

		return notes.map(({ user }) => user);
	}

	@bindThis
	private async deliverToConcerned(user: MiLocalUser, note: MiNote, content: IActivity) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		this.apDeliverManagerService.deliverToUsers(user, content, [
			...await this.getMentionedRemoteUsers(note),
			...await this.getRenotedOrRepliedRemoteUsers(note),
		]);
	}
}
