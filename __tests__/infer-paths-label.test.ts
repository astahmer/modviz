import { expect, test } from "vitest";
import { inferPathsLabel } from "~/utils/infer-paths-label";

test("inferPathsLabel - autoform", () => {
	const paths = [
		"/src/autoform/shared.ts",
		"/src/autoform/overrides.ts",
		"/src/autoform/$defs.ts",
		"/src/autoform/builder/form-builder.get-default-field.ts",
		"/src/autoform/builder/form-builder.json.export.ts",
		"/src/autoform/builder/form-builder.json.import.ts",
		"/src/autoform/builder/form-builder.json.meta.ts",
		"/src/autoform/builder/form-builder.json.types.ts",
		"/src/autoform/helpers/adapter.ts",
		"/src/autoform/helpers/for-each-property.ts",
		"/src/autoform/helpers/validator.ts",
		"/src/autoform/types.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"autoform"`);
});

test("inferPathsLabel - workflow", () => {
	const paths = [
		"/src/workflows/workflow.entity.ts",
		"/src/workflows/workflow-draft/workflow-draft.entity.ts",
		"/src/workflows/workflow-logical-block.entity.ts",
		"/src/workflows/workflow-revision.entity.ts",
		"/src/workflows/workflow-step.entity.ts",
		"/src/workflows/workflow-conditions/trigger-condition.ts",
		"/src/workflows/workflow-draft/workflow-draft-logical-block.entity.ts",
		"/src/workflows/workflow-draft/workflow-draft-step.entity.ts",
		"/src/workflows/types/workflow-schema-snapshot.types.ts",
		"/src/workflows/workflow-conditions/types/condition-value.ts",
		"/src/workflows/workflow-conditions/types/operator.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"workflows"`);
});

test("inferPathsLabel - commitment", () => {
	const paths = [
		"/src/commitments/helpers/computeCommitmentStatuses.ts",
		"/src/currency/entities/currency-amount.entity.ts",
		"/src/currency/interfaces/conversion-service.interface.ts",
		"/src/commitments/helpers/applyCommitmentRules.ts",
		"/src/commitments/helpers/rules/computeRenewalDate.ts",
		"/src/commitments/helpers/rules/computeStage.ts",
		"/src/commitments/helpers/rules/computeStatus.ts",
		"/src/commitments/helpers/rules/computeAnnualAmount.ts",
		"/src/commitments/helpers/rules/computeAutoRenewalDate.ts",
		"/src/commitments/helpers/rules/computeDuration.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"commitments"`);
});

test("inferPathsLabel - commitment 2", () => {
	const paths = [
		"/src/commitments/use-cases/list-commitments.use-case.ts",
		"/src/commitments/adapter-rest/commitment.openapi.ts",
		"/src/commitments/adapter-rest/commitment.schema.ts",
		"/src/commitments/services/commitments-queries.ts",
		"/src/product/helpers/paginateSchema.ts",
		"/src/auth/lib/middlewares.ts",
		"/src/product/adapter-rest/product.openapi.ts",
		"/src/product/adapter-rest/product.schema.ts",
		"/src/knowledge/adapter-rest/detectedApps.schema.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"adapter-rest"`);
});

test("inferPathsLabel - commitment 3", () => {
	const paths = [
		"/src/commitments/services/commitment-event.service.ts",
		"/src/commitments/messages/commitment-deleted.message.ts",
		"/src/commitments/messages/commitment-stage-updated.message.ts",
		"/src/commitments/messages/commitment-status-updated.message.ts",
		"/src/commitments/messages/contract-auto-renewed.message.ts",
		"/src/commitments/messages/contract-expiration-upcoming.message.ts",
		"/src/commitments/messages/contract-expired.message.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"commitments"`);
});

test("inferPathsLabel - activities", () => {
	const paths = [
		"/src/activities/activity-room.entity.ts",
		"/src/negotiations/brief-intake-form.entity.ts",
		"/src/negotiations/negotiation.entity.ts",
		"/src/activities/activity-room-event.entity.ts",
		"/src/activities/activity-room-stakeholder.entity.ts",
		"/src/activities/services/activity-room.repository.ts",
		"/src/activities/services/activity-room-event.repository.ts",
		"/src/activities/activity-room.shared.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`"activities"`);
});

test("inferPathsLabel - file/attachment/comment", () => {
	const paths = [
		"/src/comments/services/comment.repository.ts",
		"/src/commitments/services/attachment-commitment.service.ts",
		"/src/attachments/attachment.entity.ts",
		"/src/comments/comment.entity.ts",
		"/src/attachments/services/deleteAttachment.ts",
		"/src/file.entity.ts",
		"/src/files/ocr/type.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`undefined`);
});

test("inferPathsLabel - unknown", () => {
	const paths = [
		"apps/backend/src/user.entity.ts",
		"apps/backend/src/auth/userIdentity.entity.ts",
		"apps/backend/src/organizations-buyers.entity.ts",
		"apps/backend/src/libs/orm.secret-type.ts",
		"apps/backend/src/notifications/notification-preference.entity.ts",
		"apps/backend/src/auth/userSession.entity.ts",
	];

	expect(inferPathsLabel(paths)).toMatchInlineSnapshot(`undefined`);
});
