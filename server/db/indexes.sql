-- Performance indexes on high-frequency query columns
-- Added to optimize JOIN operations across the application

CREATE INDEX idx_expenses_group_id ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_settlements_group_id ON settlements(group_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);