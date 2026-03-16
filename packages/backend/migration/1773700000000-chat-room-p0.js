/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomP01773700000000 {
	name = 'ChatRoomP01773700000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "joinPolicy" character varying(16) NOT NULL DEFAULT 'invite_only'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "discoverability" character varying(16) NOT NULL DEFAULT 'private'`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "avatarFileId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "memberCanInvite" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "allowJoinRequest" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "maxMembers" integer NOT NULL DEFAULT '50'`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "role" character varying(16) NOT NULL DEFAULT 'member'`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD "createdById" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD "expiresAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD "revokedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`UPDATE "chat_room_invitation" SET "createdById" = "room"."ownerId" FROM "chat_room" AS "room" WHERE "room"."id" = "chat_room_invitation"."roomId"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ALTER COLUMN "createdById" SET NOT NULL`);
		await queryRunner.query(`ALTER TABLE "chat_room_join_request" ADD "message" character varying(1024)`);
		await queryRunner.query(`CREATE TABLE "chat_room_ban" ("id" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "createdById" character varying(32) NOT NULL, "reason" character varying(1024), "expiresAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_89ccf8430a718d9e10d3de7e84f" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_15375f6f4ff19483e5b1ef95d9" ON "chat_room_ban" ("roomId") `);
		await queryRunner.query(`CREATE INDEX "IDX_41ec4b7c539bafbd1379c91bc5" ON "chat_room_ban" ("userId") `);
		await queryRunner.query(`CREATE INDEX "IDX_0f6f5d3605be7f73b1562c4d34" ON "chat_room_ban" ("createdById") `);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_635ecfd77ff4b74053c9e6f4eb" ON "chat_room_ban" ("roomId", "userId") `);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" ADD CONSTRAINT "FK_15375f6f4ff19483e5b1ef95d96" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" ADD CONSTRAINT "FK_41ec4b7c539bafbd1379c91bc58" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" ADD CONSTRAINT "FK_3a6abe5727b7d2660fd4fcca317" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP CONSTRAINT "FK_3a6abe5727b7d2660fd4fcca317"`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" DROP CONSTRAINT "FK_41ec4b7c539bafbd1379c91bc58"`);
		await queryRunner.query(`ALTER TABLE "chat_room_ban" DROP CONSTRAINT "FK_15375f6f4ff19483e5b1ef95d96"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_635ecfd77ff4b74053c9e6f4eb"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_0f6f5d3605be7f73b1562c4d34"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_41ec4b7c539bafbd1379c91bc5"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_15375f6f4ff19483e5b1ef95d9"`);
		await queryRunner.query(`DROP TABLE "chat_room_ban"`);
		await queryRunner.query(`ALTER TABLE "chat_room_join_request" DROP COLUMN "message"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP COLUMN "revokedAt"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP COLUMN "expiresAt"`);
		await queryRunner.query(`ALTER TABLE "chat_room_invitation" DROP COLUMN "createdById"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "role"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "maxMembers"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "allowJoinRequest"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "memberCanInvite"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "avatarFileId"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "discoverability"`);
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "joinPolicy"`);
	}
}
