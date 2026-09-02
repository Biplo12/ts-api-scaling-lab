DROP INDEX "tasks_project_created_idx";--> statement-breakpoint
CREATE INDEX "tasks_project_created_idx" ON "tasks" USING btree ("project_id","created_at" DESC NULLS FIRST);