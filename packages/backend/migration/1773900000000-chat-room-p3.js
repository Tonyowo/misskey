/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomP31773900000000 {
	name = 'ChatRoomP31773900000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "adminPermissions" character varying(32) array NOT NULL DEFAULT '{invite,approve,kick,ban,mute,announcement,pin}'`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "speakMutedUntil" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "speakMutedById" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "speakMuteReason" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "type" character varying(16) NOT NULL DEFAULT 'message'`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "systemEvent" jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "systemEvent"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "type"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "speakMuteReason"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "speakMutedById"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "speakMutedUntil"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "adminPermissions"`);
	}
}
