/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CwReplyRequired1767201200000 {
    name = 'CwReplyRequired1767201200000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "cwReplyRequired" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "note_draft" ADD "cwReplyRequired" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "cwReplyRequired"`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "cwReplyRequired"`);
    }
}
