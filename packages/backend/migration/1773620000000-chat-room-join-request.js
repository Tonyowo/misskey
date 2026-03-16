/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomJoinRequest1773620000000 {
    name = 'ChatRoomJoinRequest1773620000000'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "chat_room_join_request" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "roomId" character varying(32) NOT NULL, CONSTRAINT "PK_1a116165d4f4f9558f8dc6f07e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f9a90bcb8604482ee4dffea32a" ON "chat_room_join_request" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b384b754fba34a7e50f1173f6c" ON "chat_room_join_request" ("roomId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4ca88ce9c07e073ab2d7e01f1b" ON "chat_room_join_request" ("userId", "roomId") `);
        await queryRunner.query(`ALTER TABLE "chat_room_join_request" ADD CONSTRAINT "FK_f9a90bcb8604482ee4dffea32ae" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_room_join_request" ADD CONSTRAINT "FK_b384b754fba34a7e50f1173f6ce" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room_join_request" DROP CONSTRAINT "FK_b384b754fba34a7e50f1173f6ce"`);
        await queryRunner.query(`ALTER TABLE "chat_room_join_request" DROP CONSTRAINT "FK_f9a90bcb8604482ee4dffea32ae"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4ca88ce9c07e073ab2d7e01f1b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b384b754fba34a7e50f1173f6c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f9a90bcb8604482ee4dffea32a"`);
        await queryRunner.query(`DROP TABLE "chat_room_join_request"`);
    }
}
