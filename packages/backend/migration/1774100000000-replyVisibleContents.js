/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReplyVisibleContents1774100000000 {
	name = 'ReplyVisibleContents1774100000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "replyVisibleContents" jsonb NOT NULL DEFAULT '[]'`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD COLUMN IF NOT EXISTS "replyVisibleContents" jsonb NOT NULL DEFAULT '[]'`);

		await queryRunner.query(`
			DO $$
			DECLARE
				has_cw_reply_required boolean;
				has_reply_locked_text boolean;
			BEGIN
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'note' AND column_name = 'cwReplyRequired'
				) INTO has_cw_reply_required;
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'note' AND column_name = 'replyLockedText'
				) INTO has_reply_locked_text;

				IF has_cw_reply_required AND has_reply_locked_text THEN
					UPDATE "note"
					SET
						"replyVisibleContents" = jsonb_build_array(jsonb_build_object('text', COALESCE("replyLockedText", "text"))),
						"text" = '$[replyVisible.index=0 reply visible]',
						"localOnly" = TRUE
					WHERE "cwReplyRequired" = TRUE AND COALESCE("replyLockedText", "text") IS NOT NULL AND btrim(COALESCE("replyLockedText", "text")) <> '';
				ELSIF has_cw_reply_required THEN
					UPDATE "note"
					SET
						"replyVisibleContents" = jsonb_build_array(jsonb_build_object('text', "text")),
						"text" = '$[replyVisible.index=0 reply visible]',
						"localOnly" = TRUE
					WHERE "cwReplyRequired" = TRUE AND "text" IS NOT NULL AND btrim("text") <> '';
				END IF;
			END $$;
		`);

		await queryRunner.query(`
			DO $$
			DECLARE
				has_cw_reply_required boolean;
				has_reply_locked_text boolean;
			BEGIN
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'note_draft' AND column_name = 'cwReplyRequired'
				) INTO has_cw_reply_required;
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					WHERE table_name = 'note_draft' AND column_name = 'replyLockedText'
				) INTO has_reply_locked_text;

				IF has_cw_reply_required AND has_reply_locked_text THEN
					UPDATE "note_draft"
					SET
						"replyVisibleContents" = jsonb_build_array(jsonb_build_object('text', COALESCE("replyLockedText", "text"))),
						"text" = '$[replyVisible.index=0 reply visible]',
						"localOnly" = TRUE
					WHERE "cwReplyRequired" = TRUE AND COALESCE("replyLockedText", "text") IS NOT NULL AND btrim(COALESCE("replyLockedText", "text")) <> '';
				ELSIF has_cw_reply_required THEN
					UPDATE "note_draft"
					SET
						"replyVisibleContents" = jsonb_build_array(jsonb_build_object('text', "text")),
						"text" = '$[replyVisible.index=0 reply visible]',
						"localOnly" = TRUE
					WHERE "cwReplyRequired" = TRUE AND "text" IS NOT NULL AND btrim("text") <> '';
				END IF;
			END $$;
		`);

		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN IF EXISTS "replyLockedText"`);
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN IF EXISTS "cwReplyRequired"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN IF EXISTS "replyLockedText"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN IF EXISTS "cwReplyRequired"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "cwReplyRequired" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "replyLockedText" text`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD COLUMN IF NOT EXISTS "cwReplyRequired" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "note_draft" ADD COLUMN IF NOT EXISTS "replyLockedText" text`);
		await queryRunner.query(`UPDATE "note" SET "replyLockedText" = "replyVisibleContents"->0->>'text', "cwReplyRequired" = TRUE WHERE jsonb_array_length("replyVisibleContents") > 0`);
		await queryRunner.query(`UPDATE "note_draft" SET "replyLockedText" = "replyVisibleContents"->0->>'text', "cwReplyRequired" = TRUE WHERE jsonb_array_length("replyVisibleContents") > 0`);
		await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN IF EXISTS "replyVisibleContents"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN IF EXISTS "replyVisibleContents"`);
	}
}
