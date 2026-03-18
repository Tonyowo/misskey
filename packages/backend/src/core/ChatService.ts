/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets, EntityManager, IsNull, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomBansRepository, ChatRoomInviteLinksRepository, ChatRoomInvitationsRepository, ChatRoomJoinRequestsRepository, ChatRoomMembershipsRepository, ChatRoomsRepository, MiChatMessage, MiChatRoom, MiChatRoomBan, MiChatRoomInviteLink, MiChatRoomMembership, MiDriveFile, MiUser, MutingsRepository, UsersRepository } from '@/models/_.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { MiChatRoomJoinRequest } from '@/models/ChatRoomJoinRequest.js';
import { chatRoomAdminPermissions, type ChatRoomAdminPermission, type ChatRoomDiscoverability, type ChatRoomJoinPolicy } from '@/models/ChatRoom.js';
import type { ChatMessageSystemEvent } from '@/models/ChatMessage.js';
import type { ChatRoomMembershipRole } from '@/models/ChatRoomMembership.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';

const DEFAULT_ROOM_MAX_MEMBERS = 50;
const DEFAULT_INVITATION_EXPIRATION_MS = 1000 * 60 * 60 * 24 * 7;
const ROOM_INVITE_LINK_CODE_LENGTH = 12;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

@Injectable()
export class ChatService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomInviteLinksRepository)
		private chatRoomInviteLinksRepository: ChatRoomInviteLinksRepository,

		@Inject(DI.chatRoomBansRepository)
		private chatRoomBansRepository: ChatRoomBansRepository,

		@Inject(DI.chatRoomJoinRequestsRepository)
		private chatRoomJoinRequestsRepository: ChatRoomJoinRequestsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
	) {
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
		}

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			throw new Error('blocked');
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		// 相手を許可しておく
		if (!iApprovedOther) {
			this.chatApprovalsRepository.insertOne({
				id: this.idService.gen(),
				userId: fromUser.id,
				otherId: toUser.id,
			});
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);

		if (this.userEntityService.isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			redisPipeline.exec();
		}

		if (this.userEntityService.isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (this.userEntityService.isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (this.userEntityService.isLocalUser(toUser)) {
			setTimeout(async () => {
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
			}, 3000);
		}

		return packedMessage;
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id })).map(m => ({
			userId: m.userId,
			isMuted: m.isMuted,
			isSpeakMuted: this.isRoomSpeakMuted(m),
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: toRoom.ownerId,
			isMuted: false,
			isSpeakMuted: false,
		});

		if (!memberships.some(member => member.userId === fromUser.id)) {
			throw new Error('you are not a member of the room');
		}

		if (memberships.some(member => member.userId === fromUser.id && member.isSpeakMuted)) {
			throw new Error('you are muted in the room');
		}

		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text: params.text ? params.text.trim() : null,
			fileId: params.file ? params.file.id : null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		const redisPipeline = this.redisClient.pipeline();
		for (const membership of membershipsOtherThanMe) {
			if (membership.isMuted) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
		}
		redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行
		setTimeout(async () => {
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);

			for (let i = 0; i < membershipsOtherThanMe.length; i++) {
				const marker = markers[i][1];
				if (marker == null) continue;

				this.globalEventService.publishMainStream(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(membershipsOtherThanMe[i].userId, 'newChatMessage', packedMessageForTo);
			}
		}, 3000);

		return packedMessage;
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readAllChatMessages(
		readerId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		// TODO: newUserChatMessageExists とか newRoomChatMessageExists も消したい(けどキーの列挙が必要になって面倒)
		redisPipeline.del(`newChatMessagesExists:${readerId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(meId: MiUser['id'], room: MiChatRoom) {
		if (await this.isRoomMember(room, meId)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator({ id: meId });
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		if (message.type !== 'message') {
			throw new Error('cannot delete system message');
		}

		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: message.fromUserId }),
				this.usersRepository.findOneByOrFail({ id: message.toUserId }),
			]);

			if (this.userEntityService.isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (this.userEntityService.isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (this.userEntityService.isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			await this.chatRoomsRepository.update({
				id: message.toRoomId,
				pinnedMessageId: message.id,
			}, {
				pinnedMessageId: null,
			});
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
			.setParameter('meId', meId)
			.setParameter('otherId', otherId);

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async roomTimeline(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere('message.toRoomId = :roomId', { roomId })
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser');

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const history: MiChatMessage[] = [];

		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => (m.fromUserId === meId) ? m.toUserId! : m.fromUserId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where(new Brackets(qb => {
					qb
						.where('message.fromUserId = :meId', { meId: meId })
						.orWhere('message.toUserId = :meId', { meId: meId });
				}))
				.andWhere('message.toRoomId IS NULL')
				.andWhere(`message.fromUserId NOT IN (${ mutingQuery.getQuery() })`)
				.andWhere(`message.toUserId NOT IN (${ mutingQuery.getQuery() })`);

			if (found.length > 0) {
				query.andWhere('message.fromUserId NOT IN (:...found)', { found: found });
				query.andWhere('message.toUserId NOT IN (:...found)', { found: found });
			}

			query.setParameters(mutingQuery.getParameters());

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		// TODO: 一回のクエリにまとめられるかも
		const [memberRoomIds, ownedRoomIds] = await Promise.all([
			this.chatRoomMembershipsRepository.findBy({
				userId: meId,
			}).then(xs => xs.map(x => x.roomId)),
			this.chatRoomsRepository.findBy({
				ownerId: meId,
			}).then(xs => xs.map(x => x.id)),
		]);

		const roomIds = memberRoomIds.concat(ownedRoomIds);

		if (memberRoomIds.length === 0 && ownedRoomIds.length === 0) {
			return [];
		}

		const history: MiChatMessage[] = [];

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => m.toRoomId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where('message.toRoomId IN (:...roomIds)', { roomIds });

			if (found.length > 0) {
				query.andWhere('message.toRoomId NOT IN (:...found)', { found: found });
			}

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[roomIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
		announcement: string;
		joinPolicy: ChatRoomJoinPolicy;
		discoverability: ChatRoomDiscoverability;
		avatarFileId: string | null;
		memberCanInvite: boolean;
		adminPermissions: ChatRoomAdminPermission[];
		allowJoinRequest: boolean;
		maxMembers: number;
	}>) {
		this.ensureValidRoomSettingCombination({
			joinPolicy: params.joinPolicy ?? 'invite_only',
			discoverability: params.discoverability ?? 'private',
		});

		const room = {
			id: this.idService.gen(),
			name: params.name,
			description: params.description,
			announcement: params.announcement ?? '',
			ownerId: owner.id,
			joinPolicy: params.joinPolicy ?? 'invite_only',
			discoverability: params.discoverability ?? 'private',
			avatarFileId: params.avatarFileId ?? null,
			memberCanInvite: params.memberCanInvite ?? false,
			adminPermissions: params.adminPermissions ?? [...chatRoomAdminPermissions],
			allowJoinRequest: params.allowJoinRequest ?? true,
			maxMembers: params.maxMembers ?? DEFAULT_ROOM_MAX_MEMBERS,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);

		return created;
	}

	@bindThis
	public async hasPermissionToDeleteRoom(meId: MiUser['id'], room: MiChatRoom) {
		if (room.ownerId === meId) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator({ id: meId });
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: room.id })).map(m => ({
			userId: m.userId,
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: room.ownerId,
		});

		// 未読フラグ削除
		const redisPipeline = this.redisClient.pipeline();
		for (const membership of memberships) {
			redisPipeline.del(`newRoomChatMessageExists:${membership.userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${membership.userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		await this.chatRoomsRepository.delete(room.id);

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id']) {
		return this.chatRoomsRepository.findOne({ where: { id: roomId }, relations: ['owner'] });
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership != null;
	}

	@bindThis
	public async getRoomActorRole(room: MiChatRoom, userId: MiUser['id']): Promise<'owner' | ChatRoomMembershipRole | null> {
		if (room.ownerId === userId) return 'owner';
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership?.role ?? null;
	}

	@bindThis
	public async isRoomAdmin(room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
		const role = await this.getRoomActorRole(room, userId);
		return role === 'owner' || role === 'admin';
	}

	private hasRoomPermissionByRole(room: MiChatRoom, role: 'owner' | ChatRoomMembershipRole | null, permission: ChatRoomAdminPermission): boolean {
		if (role === 'owner') return true;
		if (role === 'admin') return room.adminPermissions.includes(permission);
		if (role === 'member') return permission === 'invite' && room.memberCanInvite;
		return false;
	}

	@bindThis
	public async hasRoomPermission(room: MiChatRoom, userId: MiUser['id'], permission: ChatRoomAdminPermission): Promise<boolean> {
		const role = await this.getRoomActorRole(room, userId);
		return this.hasRoomPermissionByRole(room, role, permission);
	}

	@bindThis
	public async canInviteToRoom(room: MiChatRoom, userId: MiUser['id']): Promise<boolean> {
		return await this.hasRoomPermission(room, userId, 'invite');
	}

	@bindThis
	public async canManageRoomJoinRequests(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'approve');
	}

	@bindThis
	public async canKickRoomMembers(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'kick');
	}

	@bindThis
	public async canBanRoomMembers(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'ban');
	}

	@bindThis
	public async canMuteRoomMembers(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'mute');
	}

	@bindThis
	public async canManageRoomAnnouncement(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'announcement');
	}

	@bindThis
	public async canPinRoomMessages(room: MiChatRoom, userId: MiUser['id']) {
		return await this.hasRoomPermission(room, userId, 'pin');
	}

	@bindThis
	public async isRoomBanned(roomId: MiChatRoom['id'], userId: MiUser['id']): Promise<boolean> {
		const now = new Date();
		const activeBan = await this.chatRoomBansRepository.findOne({
			where: [
				{ roomId, userId, expiresAt: IsNull() },
				{ roomId, userId, expiresAt: MoreThan(now) },
			],
		});
		return activeBan != null;
	}

	private async addUserToRoom(roomId: MiChatRoom['id'], userId: MiUser['id'], role: ChatRoomMembershipRole = 'member') {
		const membership = {
			id: this.idService.gen(),
			roomId,
			userId,
			role,
		} satisfies Partial<MiChatRoomMembership>;

		return await this.chatRoomMembershipsRepository.insertOne(membership);
	}

	private isRoomSpeakMuted(membership: MiChatRoomMembership | null | undefined) {
		if (membership == null) return false;
		if (membership.speakMutedById == null) return false;
		if (membership.speakMutedUntil == null) return true;
		return membership.speakMutedUntil.getTime() > Date.now();
	}

	private async ensureRoomHasSpace(room: MiChatRoom) {
		const membershipsCount = await this.chatRoomMembershipsRepository.countBy({ roomId: room.id });
		const activeMembers = membershipsCount + 1;
		if (activeMembers >= room.maxMembers) {
			throw new Error('room is full');
		}
	}

	private async ensureRoomHasSpaceInManager(manager: EntityManager, room: MiChatRoom) {
		const membershipsCount = await manager.getRepository(this.chatRoomMembershipsRepository.target).countBy({ roomId: room.id });
		const activeMembers = membershipsCount + 1;
		if (activeMembers >= room.maxMembers) {
			throw new Error('room is full');
		}
	}

	private ensureValidRoomSettingCombination(params: {
		joinPolicy: ChatRoomJoinPolicy;
		discoverability: ChatRoomDiscoverability;
	}) {
		if (params.joinPolicy === 'public' && params.discoverability === 'private') {
			throw new Error('invalid discoverability');
		}
	}

	private async findActiveRoomInvitation(roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const now = new Date();
		return await this.chatRoomInvitationsRepository.findOne({
			where: [
				{ roomId, userId, ignored: false, revokedAt: IsNull(), expiresAt: IsNull() },
				{ roomId, userId, ignored: false, revokedAt: IsNull(), expiresAt: MoreThan(now) },
			],
		});
	}

	private async findActiveRoomInvitationInManager(manager: EntityManager, roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const now = new Date();
		return await manager.getRepository(this.chatRoomInvitationsRepository.target).createQueryBuilder('invitation')
			.setLock('pessimistic_write')
			.where('invitation.roomId = :roomId', { roomId })
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE')
			.andWhere('invitation.revokedAt IS NULL')
			.andWhere(new Brackets((qb) => {
				qb.where('invitation.expiresAt IS NULL')
					.orWhere('invitation.expiresAt > :now', { now });
			}))
			.getOne();
	}

	private async lockRoomForMembershipMutation(manager: EntityManager, roomId: MiChatRoom['id']) {
		return await manager.getRepository(this.chatRoomsRepository.target).createQueryBuilder('room')
			.setLock('pessimistic_write')
			.where('room.id = :roomId', { roomId })
			.getOneOrFail();
	}

	private async createRoomSystemMessage(actorId: MiUser['id'], roomId: MiChatRoom['id'], systemEvent: ChatMessageSystemEvent) {
		const message = await this.chatMessagesRepository.insertOne({
			id: this.idService.gen(),
			fromUserId: actorId,
			toRoomId: roomId,
			type: 'system',
			text: null,
			fileId: null,
			reads: [],
			uri: null,
			reactions: [],
			systemEvent,
		});

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(message);
		this.globalEventService.publishChatRoomStream(roomId, 'message', packedMessage);

		return message;
	}

	private hasSameAdminPermissions(a: ChatRoomAdminPermission[] | undefined, b: ChatRoomAdminPermission[] | undefined): boolean {
		const aPermissions = a ?? [];
		const bPermissions = b ?? [];

		if (aPermissions.length !== bPermissions.length) {
			return false;
		}

		return aPermissions.every(permission => bPermissions.includes(permission));
	}

	private generateRoomInviteLinkCode() {
		return secureRndstr(ROOM_INVITE_LINK_CODE_LENGTH, { chars: L_CHARS });
	}

	private async createUniqueRoomInviteLinkCode() {
		for (let i = 0; i < 10; i++) {
			const code = this.generateRoomInviteLinkCode();
			const exists = await this.chatRoomInviteLinksRepository.existsBy({ code });
			if (!exists) {
				return code;
			}
		}

		throw new Error('failed to generate invite code');
	}

	private isRoomInviteLinkActive(inviteLink: MiChatRoomInviteLink) {
		if (inviteLink.revokedAt != null) return false;
		if (inviteLink.expiresAt != null && inviteLink.expiresAt.getTime() <= Date.now()) return false;
		if (inviteLink.maxUses != null && inviteLink.uses >= inviteLink.maxUses) return false;
		return true;
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) {
			throw new Error('yourself');
		}

		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canInviteToRoom(room, inviterId))) {
			throw new Error('forbidden');
		}

		if (await this.isRoomBanned(room.id, inviteeId)) {
			throw new Error('banned');
		}

		if (await this.isRoomMember(room, inviteeId)) {
			throw new Error('already member');
		}

		const existingInvitation = await this.findActiveRoomInvitation(roomId, inviteeId);
		if (existingInvitation) {
			throw new Error('already invited');
		}

		await this.ensureRoomHasSpace(room);

		// TODO: cehck block

		const invitation = {
			id: this.idService.gen(),
			roomId: room.id,
			userId: inviteeId,
			createdById: inviterId,
			expiresAt: new Date(Date.now() + DEFAULT_INVITATION_EXPIRATION_MS),
		} satisfies Partial<MiChatRoomInvitation>;

		const created = await this.chatRoomInvitationsRepository.insertOne(invitation);
		await this.chatRoomJoinRequestsRepository.delete({ roomId, userId: inviteeId });

		this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', {
			invitationId: invitation.id,
		}, inviterId);

		await this.createRoomSystemMessage(inviterId, room.id, {
			type: 'invitation_created',
			targetUserId: inviteeId,
		});

		return created;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId })
			.andWhere('invitation.revokedAt IS NULL')
			.andWhere(new Brackets((qb) => {
				qb.where('invitation.expiresAt IS NULL')
					.orWhere('invitation.expiresAt > :now', { now: new Date() });
			}));

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE')
			.andWhere('invitation.revokedAt IS NULL')
			.andWhere(new Brackets((qb) => {
				qb.where('invitation.expiresAt IS NULL')
					.orWhere('invitation.expiresAt > :now', { now: new Date() });
			}));

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async createRoomJoinRequest(requesterId: MiUser['id'], roomId: MiChatRoom['id'], message?: string | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });

		if (room.ownerId === requesterId) {
			throw new Error('yourself');
		}

		if (await this.isRoomBanned(room.id, requesterId)) {
			throw new Error('banned');
		}

		if (!room.allowJoinRequest || room.joinPolicy === 'invite_only') {
			throw new Error('request disabled');
		}

		if (await this.isRoomMember(room, requesterId)) {
			throw new Error('already member');
		}

		const existingInvitation = await this.findActiveRoomInvitation(roomId, requesterId);
		if (existingInvitation) {
			throw new Error('already invited');
		}

		const existingRequest = await this.chatRoomJoinRequestsRepository.findOneBy({ roomId, userId: requesterId });
		if (existingRequest) {
			throw new Error('already requested');
		}

		const request = {
			id: this.idService.gen(),
			roomId: room.id,
			userId: requesterId,
			message: message?.trim() || null,
		} satisfies Partial<MiChatRoomJoinRequest>;

		return await this.chatRoomJoinRequestsRepository.insertOne(request);
	}

	@bindThis
	public async cancelRoomJoinRequest(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const request = await this.chatRoomJoinRequestsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomJoinRequestsRepository.delete(request.id);
	}

	@bindThis
	public async getRoomJoinRequestsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomJoinRequest['id'] | null, untilId?: MiChatRoomJoinRequest['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomJoinRequestsRepository.createQueryBuilder('request'), sinceId, untilId)
			.andWhere('request.roomId = :roomId', { roomId });

		const requests = await query.take(limit).getMany();

		return requests;
	}

	@bindThis
	public async getMyRoomJoinRequestsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomJoinRequest['id'] | null, untilId?: MiChatRoomJoinRequest['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomJoinRequestsRepository.createQueryBuilder('request'), sinceId, untilId)
			.andWhere('request.userId = :userId', { userId });

		const requests = await query.take(limit).getMany();

		return requests;
	}

	@bindThis
	public async getPendingRoomJoinRequestCount(actorId: MiUser['id'], roomId?: MiChatRoom['id']) {
		const qb = this.chatRoomJoinRequestsRepository.createQueryBuilder('request')
			.innerJoin('chat_room', 'room', 'room.id = request.roomId')
			.leftJoin('chat_room_membership', 'membership', 'membership.roomId = room.id AND membership.userId = :actorId', { actorId })
			.where(new Brackets((inner) => {
				inner.where('room.ownerId = :actorId')
					.orWhere(new Brackets((admin) => {
						admin.where('membership.role = :adminRole', { adminRole: 'admin' })
							.andWhere(':approvePermission = ANY(room."adminPermissions")', { approvePermission: 'approve' });
					}));
			}));

		if (roomId) {
			qb.andWhere('request.roomId = :roomId', { roomId });
		}

		return await qb.getCount();
	}

	@bindThis
	public async approveRoomJoinRequest(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canManageRoomJoinRequests(room, actorId))) {
			throw new Error('forbidden');
		}

		const membership = await this.chatRoomsRepository.manager.transaction(async (manager) => {
			const managedRoom = await this.lockRoomForMembershipMutation(manager, roomId);
			const request = await manager.getRepository(this.chatRoomJoinRequestsRepository.target).findOneByOrFail({ roomId, userId });

			if (await this.isRoomBanned(room.id, userId)) {
				throw new Error('banned');
			}

			await this.ensureRoomHasSpaceInManager(manager, managedRoom);

			const createdMembership = await manager.getRepository(this.chatRoomMembershipsRepository.target).insert({
				id: this.idService.gen(),
				roomId,
				userId,
				role: 'member',
			}).then(result => manager.getRepository(this.chatRoomMembershipsRepository.target).findOneByOrFail(result.identifiers[0]));

			await manager.getRepository(this.chatRoomJoinRequestsRepository.target).delete(request.id);
			await manager.getRepository(this.chatRoomInvitationsRepository.target).delete({ roomId, userId });

			return createdMembership;
		});

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'join_request_accepted',
			targetUserId: userId,
		});

		return membership;
	}

	@bindThis
	public async rejectRoomJoinRequest(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canManageRoomJoinRequests(room, actorId))) {
			throw new Error('forbidden');
		}

		const request = await this.chatRoomJoinRequestsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomJoinRequestsRepository.delete(request.id);
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });

		await this.chatRoomsRepository.manager.transaction(async (manager) => {
			const managedRoom = await this.lockRoomForMembershipMutation(manager, roomId);

			if (await this.isRoomBanned(managedRoom.id, userId)) {
				throw new Error('banned');
			}

			if (managedRoom.ownerId === userId || await manager.getRepository(this.chatRoomMembershipsRepository.target).existsBy({ roomId, userId })) {
				throw new Error('already member');
			}

			const invitation = managedRoom.joinPolicy !== 'public' ? await this.findActiveRoomInvitationInManager(manager, roomId, userId) : null;
			if (managedRoom.joinPolicy !== 'public' && invitation == null) {
				throw new Error('not invited');
			}

			await this.ensureRoomHasSpaceInManager(manager, managedRoom);

			await manager.getRepository(this.chatRoomMembershipsRepository.target).insert({
				id: this.idService.gen(),
				roomId,
				userId,
				role: 'member',
			});

			if (invitation) {
				await manager.getRepository(this.chatRoomInvitationsRepository.target).delete(invitation.id);
			}
			await manager.getRepository(this.chatRoomJoinRequestsRepository.target).delete({ roomId, userId });
		});

		await this.createRoomSystemMessage(userId, roomId, {
			type: 'member_joined',
		});
	}

	@bindThis
	public async createRoomInviteLink(actorId: MiUser['id'], roomId: MiChatRoom['id'], params?: {
		expiresAt?: Date | null;
		maxUses?: number | null;
	}) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canInviteToRoom(room, actorId))) {
			throw new Error('forbidden');
		}

		const inviteLink = {
			id: this.idService.gen(),
			code: await this.createUniqueRoomInviteLinkCode(),
			roomId: room.id,
			createdById: actorId,
			expiresAt: params?.expiresAt ?? null,
			maxUses: params?.maxUses ?? null,
		} satisfies Partial<MiChatRoomInviteLink>;

		const created = await this.chatRoomInviteLinksRepository.insertOne(inviteLink);
		await this.createRoomSystemMessage(actorId, room.id, {
			type: 'invitation_created',
		});
		return created;
	}

	@bindThis
	public async getRoomInviteLinksWithPagination(actorId: MiUser['id'], roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInviteLink['id'] | null, untilId?: MiChatRoomInviteLink['id'] | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (!(await this.canInviteToRoom(room, actorId))) {
			throw new Error('forbidden');
		}

		const query = this.queryService.makePaginationQuery(this.chatRoomInviteLinksRepository.createQueryBuilder('inviteLink'), sinceId, untilId)
			.andWhere('inviteLink.roomId = :roomId', { roomId });

		if (actorRole !== 'owner' && actorRole !== 'admin') {
			query.andWhere('inviteLink.createdById = :actorId', { actorId });
		}

		return await query.take(limit).getMany();
	}

	@bindThis
	public async revokeRoomInviteLink(actorId: MiUser['id'], inviteLinkId: MiChatRoomInviteLink['id']) {
		const inviteLink = await this.chatRoomInviteLinksRepository.findOneByOrFail({ id: inviteLinkId });
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: inviteLink.roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (actorRole == null) {
			throw new Error('forbidden');
		}

		if (!this.hasRoomPermissionByRole(room, actorRole, 'invite')) {
			throw new Error('forbidden');
		}

		if (actorRole !== 'owner' && actorRole !== 'admin' && inviteLink.createdById !== actorId) {
			throw new Error('forbidden');
		}

		await this.chatRoomInviteLinksRepository.update(inviteLink.id, {
			revokedAt: new Date(),
		});
	}

	@bindThis
	public async useRoomInviteLink(userId: MiUser['id'], code: string, roomId?: MiChatRoom['id']) {
		const inviteLink = await this.chatRoomInviteLinksRepository.findOneByOrFail({ code });
		if (!this.isRoomInviteLinkActive(inviteLink)) {
			throw new Error('invalid invite link');
		}
		if (roomId != null && inviteLink.roomId !== roomId) {
			throw new Error('invalid invite link');
		}

		const room = await this.chatRoomsRepository.findOneByOrFail({ id: inviteLink.roomId });

		await this.chatRoomsRepository.manager.transaction(async (manager) => {
			const managedInviteLink = await manager.getRepository(this.chatRoomInviteLinksRepository.target).createQueryBuilder('inviteLink')
				.setLock('pessimistic_write')
				.where('inviteLink.id = :id', { id: inviteLink.id })
				.getOneOrFail();
			if (!this.isRoomInviteLinkActive(managedInviteLink)) {
				throw new Error('invalid invite link');
			}

			const managedRoom = await this.lockRoomForMembershipMutation(manager, managedInviteLink.roomId);

			if (await this.isRoomBanned(managedRoom.id, userId)) {
				throw new Error('banned');
			}

			if (managedRoom.ownerId === userId || await manager.getRepository(this.chatRoomMembershipsRepository.target).existsBy({ roomId: managedRoom.id, userId })) {
				throw new Error('already member');
			}

			await this.ensureRoomHasSpaceInManager(manager, managedRoom);

			await manager.getRepository(this.chatRoomMembershipsRepository.target).insert({
				id: this.idService.gen(),
				roomId: managedRoom.id,
				userId,
				role: 'member',
			});
			await manager.getRepository(this.chatRoomInviteLinksRepository.target).update(managedInviteLink.id, {
				uses: managedInviteLink.uses + 1,
			});
			await manager.getRepository(this.chatRoomJoinRequestsRepository.target).delete({ roomId: managedRoom.id, userId });
			await manager.getRepository(this.chatRoomInvitationsRepository.target).delete({ roomId: managedRoom.id, userId });
		});

		await this.createRoomSystemMessage(userId, room.id, {
			type: 'member_joined',
		});

		return room;
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.delete(membership.id);

		// 未読フラグを消す (「既読にする」というわけでもないのでreadメソッドは使わないでおく)
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();

		await this.createRoomSystemMessage(userId, roomId, {
			type: 'member_left',
		});
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		announcement?: string;
		joinPolicy?: ChatRoomJoinPolicy;
		discoverability?: ChatRoomDiscoverability;
		avatarFileId?: string | null;
		memberCanInvite?: boolean;
		adminPermissions?: ChatRoomAdminPermission[];
		allowJoinRequest?: boolean;
		maxMembers?: number;
	}, actorId?: MiUser['id']): Promise<MiChatRoom> {
		this.ensureValidRoomSettingCombination({
			joinPolicy: params.joinPolicy ?? room.joinPolicy,
			discoverability: params.discoverability ?? room.discoverability,
		});

		const updated = await this.chatRoomsRepository.createQueryBuilder().update()
			.set(params)
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});

		if (actorId != null && params.adminPermissions != null && !this.hasSameAdminPermissions(room.adminPermissions, params.adminPermissions)) {
			await this.createRoomSystemMessage(actorId, room.id, {
				type: 'admin_permissions_updated',
				permissions: updated.adminPermissions,
			});
		}

		return updated;
	}

	@bindThis
	public async updateRoomAnnouncement(actorId: MiUser['id'], roomId: MiChatRoom['id'], announcement: string) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canManageRoomAnnouncement(room, actorId))) {
			throw new Error('forbidden');
		}

		const updated = await this.chatRoomsRepository.createQueryBuilder().update()
			.set({ announcement })
			.where('id = :id', { id: roomId })
			.returning('*')
			.execute()
			.then((response) => response.raw[0]);

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'announcement_updated',
		});

		return updated;
	}

	@bindThis
	public async pinRoomMessage(actorId: MiUser['id'], roomId: MiChatRoom['id'], messageId: MiChatMessage['id'] | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canPinRoomMessages(room, actorId))) {
			throw new Error('forbidden');
		}

		if (messageId != null) {
			const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });
			if (message.toRoomId !== roomId || message.type !== 'message') {
				throw new Error('invalid message');
			}
		}

		const updated = await this.chatRoomsRepository.createQueryBuilder().update()
			.set({ pinnedMessageId: messageId })
			.where('id = :id', { id: roomId })
			.returning('*')
			.execute()
			.then((response) => response.raw[0]);

		await this.createRoomSystemMessage(actorId, roomId, {
			type: messageId == null ? 'message_unpinned' : 'message_pinned',
			messageId,
		});

		return updated;
	}

	@bindThis
	public async getRoomMembershipsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.roomId = :roomId', { roomId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}

	@bindThis
	public async revokeRoomInvitation(actorId: MiUser['id'], invitationId: MiChatRoomInvitation['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ id: invitationId });
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: invitation.roomId });
		if (!(await this.canInviteToRoom(room, actorId))) {
			throw new Error('forbidden');
		}

		if (invitation.revokedAt != null) {
			throw new Error('already revoked');
		}

		await this.chatRoomInvitationsRepository.update(invitation.id, { revokedAt: new Date() });
	}

	@bindThis
	public async kickRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (!this.hasRoomPermissionByRole(room, actorRole, 'kick')) {
			throw new Error('forbidden');
		}
		if (room.ownerId === userId) {
			throw new Error('cannot kick owner');
		}

		const targetMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		if (actorRole === 'admin' && targetMembership.role === 'admin') {
			throw new Error('forbidden');
		}

		await this.chatRoomMembershipsRepository.delete(targetMembership.id);

		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'member_kicked',
			targetUserId: userId,
		});
	}

	@bindThis
	public async banRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id'], reason?: string | null, expiresAt?: Date | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (!this.hasRoomPermissionByRole(room, actorRole, 'ban')) {
			throw new Error('forbidden');
		}
		if (expiresAt != null && expiresAt.getTime() <= Date.now()) {
			throw new Error('invalid expires at');
		}
		if (room.ownerId === userId) {
			throw new Error('cannot ban owner');
		}

		const targetMembership = await this.chatRoomMembershipsRepository.findOneBy({ roomId, userId });
		if (actorRole === 'admin' && targetMembership?.role === 'admin') {
			throw new Error('forbidden');
		}

		await this.chatRoomsRepository.manager.transaction(async (manager) => {
			await manager.getRepository(this.chatRoomBansRepository.target).upsert({
				id: this.idService.gen(),
				roomId,
				userId,
				createdById: actorId,
				reason: reason?.trim() || null,
				expiresAt: expiresAt ?? null,
			}, ['roomId', 'userId']);
			await manager.getRepository(this.chatRoomMembershipsRepository.target).delete({ roomId, userId });
			await manager.getRepository(this.chatRoomInvitationsRepository.target).delete({ roomId, userId });
			await manager.getRepository(this.chatRoomJoinRequestsRepository.target).delete({ roomId, userId });
		});

		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${userId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${roomId}`);
		await redisPipeline.exec();

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'member_banned',
			targetUserId: userId,
			reason: reason?.trim() || null,
			expiresAt: expiresAt ?? null,
		});
	}

	@bindThis
	public async getRoomBansWithPagination(actorId: MiUser['id'], roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomBan['id'] | null, untilId?: MiChatRoomBan['id'] | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canBanRoomMembers(room, actorId))) {
			throw new Error('forbidden');
		}

		const query = this.queryService.makePaginationQuery(this.chatRoomBansRepository.createQueryBuilder('ban'), sinceId, untilId)
			.andWhere('ban.roomId = :roomId', { roomId });

		return await query.take(limit).getMany();
	}

	@bindThis
	public async unbanRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		if (!(await this.canBanRoomMembers(room, actorId))) {
			throw new Error('forbidden');
		}
		await this.chatRoomBansRepository.delete({ roomId, userId });

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'member_unbanned',
			targetUserId: userId,
		});
	}

	@bindThis
	public async muteRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id'], expiresAt?: Date | null, reason?: string | null) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (!this.hasRoomPermissionByRole(room, actorRole, 'mute')) {
			throw new Error('forbidden');
		}
		if (expiresAt != null && expiresAt.getTime() <= Date.now()) {
			throw new Error('invalid expires at');
		}
		if (room.ownerId === userId) {
			throw new Error('cannot mute owner');
		}

		const targetMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		if (actorRole === 'admin' && targetMembership.role === 'admin') {
			throw new Error('forbidden');
		}

		await this.chatRoomMembershipsRepository.update(targetMembership.id, {
			speakMutedById: actorId,
			speakMutedUntil: expiresAt ?? null,
			speakMuteReason: reason?.trim() || null,
		});

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'member_muted',
			targetUserId: userId,
			expiresAt: expiresAt ?? null,
			reason: reason?.trim() || null,
		});
	}

	@bindThis
	public async unmuteRoomMember(actorId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
		const actorRole = await this.getRoomActorRole(room, actorId);
		if (!this.hasRoomPermissionByRole(room, actorRole, 'mute')) {
			throw new Error('forbidden');
		}

		const targetMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		if (actorRole === 'admin' && targetMembership.role === 'admin') {
			throw new Error('forbidden');
		}
		await this.chatRoomMembershipsRepository.update(targetMembership.id, {
			speakMutedById: null,
			speakMutedUntil: null,
			speakMuteReason: null,
		});

		await this.createRoomSystemMessage(actorId, roomId, {
			type: 'member_unmuted',
			targetUserId: userId,
		});
	}

	@bindThis
	public async addRoomAdmin(ownerId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId, ownerId });
		if (room.ownerId === userId) return;
		const targetMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(targetMembership.id, { role: 'admin' });

		await this.createRoomSystemMessage(ownerId, roomId, {
			type: 'member_promoted',
			targetUserId: userId,
		});
	}

	@bindThis
	public async removeRoomAdmin(ownerId: MiUser['id'], roomId: MiChatRoom['id'], userId: MiUser['id']) {
		await this.chatRoomsRepository.findOneByOrFail({ id: roomId, ownerId });
		const targetMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(targetMembership.id, { role: 'member' });

		await this.createRoomSystemMessage(ownerId, roomId, {
			type: 'member_demoted',
			targetUserId: userId,
		});
	}

	@bindThis
	public async transferRoomOwner(ownerId: MiUser['id'], roomId: MiChatRoom['id'], newOwnerId: MiUser['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId, ownerId });
		if (newOwnerId === ownerId) return room;

		const newOwnerMembership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId: newOwnerId });

		await this.chatRoomsRepository.manager.transaction(async (manager) => {
			await manager.getRepository(this.chatRoomMembershipsRepository.target).delete(newOwnerMembership.id);

			const oldOwnerMembership = await manager.getRepository(this.chatRoomMembershipsRepository.target).findOneBy({ roomId, userId: ownerId });
			if (!oldOwnerMembership) {
				await manager.getRepository(this.chatRoomMembershipsRepository.target).insert({
					id: this.idService.gen(),
					roomId,
					userId: ownerId,
					role: 'admin',
				});
			} else {
				await manager.getRepository(this.chatRoomMembershipsRepository.target).update(oldOwnerMembership.id, { role: 'admin' });
			}

			await manager.getRepository(this.chatRoomsRepository.target).update(room.id, { ownerId: newOwnerId });
		});

		await this.createRoomSystemMessage(ownerId, roomId, {
			type: 'owner_transferred',
			targetUserId: newOwnerId,
		});

		return await this.chatRoomsRepository.findOneByOrFail({ id: roomId });
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
	}) {
		const q = this.chatMessagesRepository.createQueryBuilder('message');

		if (params.userId) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
		} else if (params.roomId) {
			q.where('message.toRoomId = :roomId', { roomId: params.roomId });
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());
		}

		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(query.toLowerCase()) }%` });

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.orderBy('message.id', 'DESC').take(limit).getMany();

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = (await this.customEmojiService.localEmojisCache.fetch()).get(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });
		if (message.type !== 'message') {
			throw new Error('cannot react to system message');
		}

		if (message.fromUserId === userId) {
			throw new Error('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new Error('cannot react to others message');
		}

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!await this.isRoomMember(room, userId)) {
				throw new Error('cannot react to others message');
			}
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_append("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		// NOTE: 自分のリアクションを(あれば)削除するだけなので諸々の権限チェックは必要なし

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });
		if (message.type !== 'message') {
			throw new Error('cannot react to system message');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => `array_remove("reactions", '${userId}/${reaction}')`,
			})
			.where('id = :id', { id: message.id })
			.execute();

		// TODO: 実際に削除が行われたときのみイベントを発行する

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.userId = :userId', { userId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}
}
