/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReplyLockedText1767201400000 {
    name = 'ReplyLockedText1767201400000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "replyLockedText" text`);
        await queryRunner.query(`ALTER TABLE "note_draft" ADD "replyLockedText" text`);
        await queryRunner.query(`UPDATE "note" SET "replyLockedText" = "text", "text" = NULL, "localOnly" = TRUE WHERE "cwReplyRequired" = TRUE AND "text" IS NOT NULL`);
        await queryRunner.query(`UPDATE "note_draft" SET "replyLockedText" = "text", "text" = NULL, "localOnly" = TRUE WHERE "cwReplyRequired" = TRUE AND "text" IS NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`UPDATE "note_draft" SET "text" = COALESCE("text", "replyLockedText") WHERE "replyLockedText" IS NOT NULL`);
        await queryRunner.query(`UPDATE "note" SET "text" = COALESCE("text", "replyLockedText") WHERE "replyLockedText" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "replyLockedText"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "replyLockedText"`);
    }
}
