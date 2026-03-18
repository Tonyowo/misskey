/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomInviteLink, ChatRoomInviteLinksRepository, MiChatRoomJoinRequest, ChatRoomJoinRequestsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository, MiChatRoomBan, ChatRoomBansRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { chatRoomAdminPermissions } from '@/models/ChatRoom.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';

@Injectable()
export class ChatEntityService {
	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomInviteLinksRepository)
		private chatRoomInviteLinksRepository: ChatRoomInviteLinksRepository,

		@Inject(DI.chatRoomJoinRequestsRepository)
		private chatRoomJoinRequestsRepository: ChatRoomJoinRequestsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.chatRoomBansRepository)
		private chatRoomBansRepository: ChatRoomBansRepository,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
	) {
	}

	private isActiveSpeakMuted(membership: MiChatRoomMembership | null | undefined) {
		if (membership == null) return false;
		if (membership.speakMutedById == null) return false;
		if (membership.speakMutedUntil == null) return true;
		return membership.speakMutedUntil.getTime() > Date.now();
	}

	private async packSystemEvent(
		systemEvent: MiChatMessage['systemEvent'],
		me?: { id: MiUser['id'] },
		packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>,
	) {
		if (systemEvent == null) return null;

		const targetUserId = systemEvent.targetUserId ?? null;

		return {
			...systemEvent,
			expiresAt: systemEvent.expiresAt instanceof Date ? systemEvent.expiresAt.toISOString() : (systemEvent.expiresAt ?? null),
			targetUserId,
			targetUser: targetUserId != null ? (packedUsers?.get(targetUserId) ?? await this.userEntityService.pack(targetUserId, me).catch(() => null)) : undefined,
		};
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiChatMessage['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId).catch(() => null),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			type: message.type,
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId, me),
			toUserId: message.toUserId,
			toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? await this.userEntityService.pack(message.toUser ?? message.toUserId, me)) : undefined,
			toRoomId: message.toRoomId,
			toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? await this.packRoom(message.toRoom ?? message.toRoomId, me)) : undefined,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
			systemEvent: await this.packSystemEvent(message.systemEvent, me, packedUsers),
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter(x => x != null).filter(excludeMe),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));
		const systemEventUserIds = messages.map(x => x.systemEvent?.targetUserId).filter((x): x is string => x != null);

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		for (const systemEventUserId of systemEventUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === systemEventUserId : x.id === systemEventUserId)) {
				users.push(systemEventUserId);
			}
		}

		// TODO: packedUsersに削除されたユーザーもnullとして含める
		const [packedUsers, packedFiles, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.packRooms(messages.map(m => m.toRoom ?? m.toRoomId).filter(x => x != null), me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return Promise.all(messages.map(message => this.packMessageDetailed(message, me, { _hint_: { packedUsers, packedFiles, packedRooms } })));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			type: message.type,
			text: message.text,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions,
			systemEvent: await this.packSystemEvent(message.systemEvent),
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		// userは削除されている可能性があるのでnull許容
		const reactions: { user: Packed<'UserLite'> | null; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId).catch(() => null),
				reaction,
			});
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			type: message.type,
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId),
			toRoomId: message.toRoomId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			reactions: reactions.filter((r): r is { user: Packed<'UserLite'>; reaction: string; } => r.user != null),
			systemEvent: await this.packSystemEvent(message.systemEvent, undefined, packedUsers),
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users = messages.map(x => x.fromUser ?? x.fromUserId);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));
		const systemEventUserIds = messages.map(x => x.systemEvent?.targetUserId).filter((x): x is string => x != null);

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		for (const systemEventUserId of systemEventUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === systemEventUserId : x.id === systemEventUserId)) {
				users.push(systemEventUserId);
			}
		}

		const [packedUsers, packedFiles] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return Promise.all(messages.map(message => this.packMessageLiteForRoom(message, { _hint_: { packedFiles, packedUsers } })));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				myMemberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
				myInvitations?: Map<MiChatRoom['id'], MiChatRoomInvitation | null | undefined>;
				myJoinRequests?: Map<MiChatRoom['id'], MiChatRoomJoinRequest | null | undefined>;
				memberCounts?: Map<MiChatRoom['id'], number>;
				pendingRequestCounts?: Map<MiChatRoom['id'], number>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });
		const now = new Date();

		const membership = me && me.id !== room.ownerId ? (options?._hint_?.myMemberships?.get(room.id) ?? await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const invitation = me && me.id !== room.ownerId ? (options?._hint_?.myInvitations?.get(room.id) ?? await this.chatRoomInvitationsRepository.findOne({
			where: [
				{ roomId: room.id, userId: me.id, ignored: false, revokedAt: IsNull(), expiresAt: IsNull() },
				{ roomId: room.id, userId: me.id, ignored: false, revokedAt: IsNull(), expiresAt: MoreThan(now) },
			],
		})) : null;
		const joinRequest = me && me.id !== room.ownerId ? (options?._hint_?.myJoinRequests?.get(room.id) ?? await this.chatRoomJoinRequestsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const myRole = room.ownerId === me?.id ? 'owner' : membership?.role ?? null;
		const isJoined = room.ownerId === me?.id || membership != null;
		const adminPermissions = myRole === 'owner' ? [...chatRoomAdminPermissions] : room.adminPermissions;
		const canManageAdmins = myRole === 'owner';
		const canManageJoinRequests = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('approve'));
		const canKickMembers = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('kick'));
		const canBanMembers = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('ban'));
		const canMuteMembers = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('mute'));
		const canManageAnnouncement = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('announcement'));
		const canPinMessages = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('pin'));
		const canManageMembers = canManageAdmins || canManageJoinRequests || canKickMembers || canBanMembers || canMuteMembers;
		const canInvite = myRole === 'owner' || (myRole === 'admin' && adminPermissions.includes('invite')) || (myRole === 'member' && room.memberCanInvite);
		const memberCount = options?._hint_?.memberCounts?.get(room.id) ?? (1 + await this.chatRoomMembershipsRepository.countBy({ roomId: room.id }));
		const pendingRequestCount = canManageJoinRequests ? (options?._hint_?.pendingRequestCounts?.get(room.id) ?? await this.chatRoomJoinRequestsRepository.countBy({ roomId: room.id })) : 0;
		const isSpeakMuted = this.isActiveSpeakMuted(membership);

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			announcement: isJoined ? room.announcement : '',
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			joinPolicy: room.joinPolicy,
			discoverability: room.discoverability,
			avatarFileId: room.avatarFileId,
			pinnedMessageId: isJoined ? room.pinnedMessageId : null,
			memberCanInvite: room.memberCanInvite,
			adminPermissions: isJoined ? room.adminPermissions : [],
			allowJoinRequest: room.allowJoinRequest,
			maxMembers: room.maxMembers,
			memberCount,
			isMuted: membership != null ? membership.isMuted : false,
			isSpeakMuted,
			speakMutedUntil: isSpeakMuted && membership?.speakMutedUntil != null ? membership.speakMutedUntil.toISOString() : null,
			speakMuteReason: isSpeakMuted ? (membership?.speakMuteReason ?? null) : null,
			isJoined,
			myRole,
			canInvite,
			canManageMembers,
			canManageAdmins,
			canManageJoinRequests,
			canKickMembers,
			canBanMembers,
			canMuteMembers,
			canManageAnnouncement,
			canPinMessages,
			pendingRequestCount,
			invitationExists: invitation != null,
			joinRequestExists: joinRequest != null,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me: { id: MiUser['id'] },
	) {
		if (rooms.length === 0) return [];

		const _rooms = rooms.filter((room): room is MiChatRoom => typeof room !== 'string');
		if (_rooms.length !== rooms.length) {
			_rooms.push(
				...await this.chatRoomsRepository.find({
					where: {
						id: In(rooms.filter((room): room is string => typeof room === 'string')),
					},
					relations: ['owner'],
				}),
			);
		}

		const owners = _rooms.map(x => x.owner ?? x.ownerId);

		const [packedOwners, myMemberships, myInvitations, myJoinRequests, memberCounts, pendingRequestCounts] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(memberships => new Map(_rooms.map(r => [r.id, memberships.find(m => m.roomId === r.id)]))),
			this.chatRoomInvitationsRepository.find({
				where: [
					{
						roomId: In(_rooms.map(x => x.id)),
						userId: me.id,
						ignored: false,
						revokedAt: IsNull(),
						expiresAt: IsNull(),
					},
					{
						roomId: In(_rooms.map(x => x.id)),
						userId: me.id,
						ignored: false,
						revokedAt: IsNull(),
						expiresAt: MoreThan(new Date()),
					},
				],
			}).then(invitations => new Map(_rooms.map(r => [r.id, invitations.find(i => i.roomId === r.id)]))),
			this.chatRoomJoinRequestsRepository.find({
				where: {
					roomId: In(_rooms.map(x => x.id)),
					userId: me.id,
				},
			}).then(requests => new Map(_rooms.map(r => [r.id, requests.find(request => request.roomId === r.id)]))),
			this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId', 'roomId')
				.addSelect('COUNT(*)', 'count')
				.where('membership.roomId IN (:...roomIds)', { roomIds: _rooms.map(x => x.id) })
				.groupBy('membership.roomId')
				.getRawMany<{ roomId: string; count: string; }>()
				.then(rows => new Map(_rooms.map(r => [r.id, 1 + Number(rows.find(row => row.roomId === r.id)?.count ?? 0)]))),
			this.chatRoomJoinRequestsRepository.createQueryBuilder('request')
				.select('request.roomId', 'roomId')
				.addSelect('COUNT(*)', 'count')
				.where('request.roomId IN (:...roomIds)', { roomIds: _rooms.map(x => x.id) })
				.groupBy('request.roomId')
				.getRawMany<{ roomId: string; count: string; }>()
				.then(rows => new Map(_rooms.map(r => [r.id, Number(rows.find(row => row.roomId === r.id)?.count ?? 0)]))),
		]);

		return Promise.all(_rooms.map(room => this.packRoom(room, me, { _hint_: { packedOwners, myMemberships, myInvitations, myJoinRequests, memberCounts, pendingRequestCounts } })));
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomInvitation['userId'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? await this.packRoom(invitation.room ?? invitation.roomId, me),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? await this.userEntityService.pack(invitation.user ?? invitation.userId, me),
			createdById: invitation.createdById,
			expiresAt: invitation.expiresAt ? invitation.expiresAt.toISOString() : null,
			revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
			ignored: invitation.ignored,
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		return Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me)));
	}

	@bindThis
	public async packRoomInviteLink(
		src: MiChatRoomInviteLink['id'] | MiChatRoomInviteLink,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms?: Map<MiChatRoomInviteLink['roomId'], Packed<'ChatRoom'>>;
				packedUsers?: Map<MiChatRoomInviteLink['createdById'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInviteLink'>> {
		const inviteLink = typeof src === 'object' ? src : await this.chatRoomInviteLinksRepository.findOneByOrFail({ id: src });

		return {
			id: inviteLink.id,
			createdAt: this.idService.parse(inviteLink.id).date.toISOString(),
			code: inviteLink.code,
			roomId: inviteLink.roomId,
			room: options?._hint_?.packedRooms?.get(inviteLink.roomId) ?? await this.packRoom(inviteLink.room ?? inviteLink.roomId, me),
			createdById: inviteLink.createdById,
			createdBy: options?._hint_?.packedUsers?.get(inviteLink.createdById) ?? await this.userEntityService.pack(inviteLink.createdBy ?? inviteLink.createdById, me),
			uses: inviteLink.uses,
			maxUses: inviteLink.maxUses,
			expiresAt: inviteLink.expiresAt ? inviteLink.expiresAt.toISOString() : null,
			revokedAt: inviteLink.revokedAt ? inviteLink.revokedAt.toISOString() : null,
		};
	}

	@bindThis
	public async packRoomInviteLinks(
		inviteLinks: MiChatRoomInviteLink[],
		me: { id: MiUser['id'] },
	) {
		if (inviteLinks.length === 0) return [];

		const rooms = inviteLinks.map(x => x.room ?? x.roomId);
		const creators = inviteLinks.map(x => x.createdBy ?? x.createdById);

		const [packedRooms, packedUsers] = await Promise.all([
			this.packRooms(rooms, me)
				.then(items => new Map(items.map(room => [room.id, room]))),
			this.userEntityService.packMany(creators, me)
				.then(items => new Map(items.map(user => [user.id, user]))),
		]);

		return Promise.all(inviteLinks.map(inviteLink => this.packRoomInviteLink(inviteLink, me, { _hint_: { packedRooms, packedUsers } })));
	}

	@bindThis
	public async packRoomJoinRequest(
		src: MiChatRoomJoinRequest['id'] | MiChatRoomJoinRequest,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomJoinRequest['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomJoinRequest['userId'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomJoinRequest'>> {
		const request = typeof src === 'object' ? src : await this.chatRoomJoinRequestsRepository.findOneByOrFail({ id: src });

		return {
			id: request.id,
			createdAt: this.idService.parse(request.id).date.toISOString(),
			roomId: request.roomId,
			room: options?._hint_?.packedRooms.get(request.roomId) ?? await this.packRoom(request.room ?? request.roomId, me),
			userId: request.userId,
			user: options?._hint_?.packedUsers.get(request.userId) ?? await this.userEntityService.pack(request.user ?? request.userId, me),
			message: request.message,
		};
	}

	@bindThis
	public async packRoomJoinRequests(
		requests: MiChatRoomJoinRequest[],
		me: { id: MiUser['id'] },
	) {
		if (requests.length === 0) return [];

		return Promise.all(requests.map(request => this.packRoomJoinRequest(request, me)));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomMembership['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? await this.userEntityService.pack(membership.user ?? membership.userId, me)) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? await this.packRoom(membership.room ?? membership.roomId, me)) : undefined,
			role: membership.role,
			isSpeakMuted: this.isActiveSpeakMuted(membership),
			speakMutedUntil: this.isActiveSpeakMuted(membership) && membership.speakMutedUntil != null ? membership.speakMutedUntil.toISOString() : null,
			speakMuteReason: this.isActiveSpeakMuted(membership) ? membership.speakMuteReason : null,
			speakMutedById: this.isActiveSpeakMuted(membership) ? membership.speakMutedById : null,
			speakMutedBy: this.isActiveSpeakMuted(membership) && membership.speakMutedById != null ? await this.userEntityService.pack(membership.speakMutedById, me).catch(() => null) : null,
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = memberships.map(x => x.user ?? x.userId);
		const rooms = memberships.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.packRooms(rooms, me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}

	@bindThis
	public async packRoomBan(
		src: MiChatRoomBan['id'] | MiChatRoomBan,
		me: { id: MiUser['id'] },
	): Promise<Packed<'ChatRoomBan'>> {
		const ban = typeof src === 'object' ? src : await this.chatRoomBansRepository.findOneByOrFail({ id: src });

		return {
			id: ban.id,
			createdAt: this.idService.parse(ban.id).date.toISOString(),
			roomId: ban.roomId,
			userId: ban.userId,
			user: await this.userEntityService.pack(ban.user ?? ban.userId, me).catch(() => null),
			createdById: ban.createdById,
			createdBy: await this.userEntityService.pack(ban.createdById, me).catch(() => null),
			reason: ban.reason,
			expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
		};
	}

	@bindThis
	public async packRoomBans(
		bans: MiChatRoomBan[],
		me: { id: MiUser['id'] },
	) {
		if (bans.length === 0) return [];

		return Promise.all(bans.map(ban => this.packRoomBan(ban, me)));
	}
}
