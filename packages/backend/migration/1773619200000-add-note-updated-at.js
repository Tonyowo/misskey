/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddNoteUpdatedAt1773619200000 {
    name = 'AddNoteUpdatedAt1773619200000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" ADD "updatedAt" TIMESTAMP WITH TIME ZONE`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "updatedAt"`);
    }
}
