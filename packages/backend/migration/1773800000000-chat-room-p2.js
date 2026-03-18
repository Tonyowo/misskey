/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomP21773800000000 {
	name = 'ChatRoomP21773800000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "announcement" character varying(4096) NOT NULL DEFAULT ''`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "pinnedMessageId" character varying(32)`);
		await queryRunner.query(`CREATE TABLE "chat_room_invite_link" ("id" character varying(32) NOT NULL, "code" character varying(64) NOT NULL, "roomId" character varying(32) NOT NULL, "createdById" character varying(32) NOT NULL, "uses" integer NOT NULL DEFAULT '0', "maxUses" integer, "expiresAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a6380d051d935f301a56888b6a5" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97d65ff480d95e3e2bd6b61cf8" ON "chat_room_invite_link" ("code") `);
		await queryRunner.query(`CREATE INDEX "IDX_9295d43264fbf06eb677446d47" ON "chat_room_invite_link" ("roomId") `);
		await queryRunner.query(`CREATE INDEX "IDX_d6733ecedf3ee502ff17f447bf" ON "chat_room_invite_link" ("createdById") `);
		await queryRunner.query(`ALTER TABLE "chat_room_invite_link" ADD CONSTRAINT "FK_9295d43264fbf06eb677446d47f" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_invite_link" ADD CONSTRAINT "FK_d6733ecedf3ee502ff17f447bfa" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_invite_link" DROP CONSTRAINT "FK_d6733ecedf3ee502ff17f447bfa"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invite_link" DROP CONSTRAINT "FK_9295d43264fbf06eb677446d47f"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_d6733ecedf3ee502ff17f447bf"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_9295d43264fbf06eb677446d47"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_97d65ff480d95e3e2bd6b61cf8"`);
		await queryRunner.query(`DROP TABLE "chat_room_invite_link"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "pinnedMessageId"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "announcement"`);
	}
}
