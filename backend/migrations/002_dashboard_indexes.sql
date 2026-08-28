-- Phase 5: Dashboard performance indexes
-- These three composite indexes support the dashboard aggregation queries.
--
-- Trade-off: each index adds a small overhead on INSERT/UPDATE for issues
-- and issue_activity. For a project-management tool the dashboard is read
-- frequently; the read speedup outweighs the write cost.

-- B. Priority aggregation — GROUP BY priority filtered by project_id
-- Without this, PostgreSQL must scan all rows matching idx_issues_project_id
-- and then re-filter. The composite index enables an index-only scan.
CREATE INDEX IF NOT EXISTS idx_issues_project_priority
  ON issues (project_id, priority);

-- C. Assignee workload — GROUP BY assignee_id filtered by project_id
-- Existing idx_issues_project_id + idx_issues_assignee_id are separate;
-- the composite index lets the planner satisfy WHERE and GROUP BY in one
-- index scan with no additional heap lookups for the GROUP BY key.
CREATE INDEX IF NOT EXISTS idx_issues_project_assignee
  ON issues (project_id, assignee_id);

-- E. Recent activity — ORDER BY ia.created_at DESC LIMIT N for issues in a project
-- The existing idx_issue_activity_issue_id covers the JOIN, but the sort
-- still requires a filesort across the full result set.
-- This composite index lets PostgreSQL merge-join on issue_id and skip the
-- sort entirely when reading results newest-first.
CREATE INDEX IF NOT EXISTS idx_issue_activity_issue_created
  ON issue_activity (issue_id, created_at DESC);
