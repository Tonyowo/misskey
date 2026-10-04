/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteRevisions1791106190566 {
    name = 'NoteRevisions1791106190566'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_3a6abe5727b7d2660fd4fcca31" ON "chat_room_invitation" ("createdById")`);
        await queryRunner.query(`CREATE TABLE "note_revision" ("id" character varying(32) NOT NULL, "noteId" character varying(32) NOT NULL, "revision" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "schemaVersion" integer NOT NULL DEFAULT '1', "snapshot" jsonb NOT NULL, CONSTRAINT "PK_8499eb36b6b27b4a7391a9b0912" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_note_revision_note_id" ON "note_revision"  ("noteId", "id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_note_revision_note_revision" ON "note_revision"  ("noteId", "revision") `);
        await queryRunner.query(`ALTER TABLE "note" ADD "revision" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS 'The updated date of the Note.'`);
        await queryRunner.query(`ALTER TABLE "note_revision" ADD CONSTRAINT "FK_cacf2574713dd426fc1ddce587c" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_3a6abe5727b7d2660fd4fcca31"`);
        await queryRunner.query(`ALTER TABLE "note_revision" DROP CONSTRAINT "FK_cacf2574713dd426fc1ddce587c"`);
        await queryRunner.query(`COMMENT ON COLUMN "note"."updatedAt" IS NULL`);
        await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "revision"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_note_revision_note_revision"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_note_revision_note_id"`);
        await queryRunner.query(`DROP TABLE "note_revision"`);
    }
}
