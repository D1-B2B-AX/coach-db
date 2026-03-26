ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_company_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT email LIKE '%@day1company.co.kr'
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "company_users_all" ON coaches
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

CREATE POLICY "company_users_all" ON courses
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

CREATE POLICY "company_users_all" ON coach_courses
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());

CREATE POLICY "company_users_read" ON coach_memos
  FOR SELECT USING (is_company_user());
CREATE POLICY "company_users_insert" ON coach_memos
  FOR INSERT WITH CHECK (is_company_user() AND auth.uid() = user_id);
CREATE POLICY "own_memo_delete" ON coach_memos
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "company_users_all" ON sync_logs
  FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());
