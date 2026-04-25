/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomMentions1774000000000 {
	name = 'ChatRoomMentions1774000000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "mentions" character varying(32) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "mentionAll" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_mentions" ON "chat_message" USING gin ("mentions")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_message_mentions"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "mentionAll"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "mentions"`);
	}
}
