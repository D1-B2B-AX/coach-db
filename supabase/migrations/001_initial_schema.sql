-- 코치
CREATE TABLE coaches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  birth_date    DATE,
  organization  TEXT,
  subjects      TEXT[] DEFAULT '{}',
  is_new        BOOLEAN DEFAULT true,          -- D-021: 구글시트 Y/N → boolean
  availability  TEXT DEFAULT 'unknown'         -- D-029: 가능/불가/미확인 (앱에서 수동 입력, 동기화 대상 아님)
                  CHECK (availability IN ('available', 'unavailable', 'unknown')),
  skill_stack   TEXT[] DEFAULT '{}',           -- D-016: 1차 비워둠, 1.5차 노션 동기화
  notion_url    TEXT,
  portfolio_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 교육 과정
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,
  start_date    DATE,
  end_date      DATE,
  operator      TEXT,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  client        TEXT,
  lead          TEXT,
  instructor_name TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 코치 ↔ 과정
CREATE TABLE coach_courses (
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_id, course_id)
);

-- 연락 메모
CREATE TABLE coach_memos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 동기화 이력
CREATE TABLE sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_by     UUID REFERENCES auth.users(id),
  status        TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  total_rows    INT,
  created_count INT,
  updated_count INT,
  error_message TEXT,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

-- 강사 (3차 대비, UI 미구현)
CREATE TABLE instructors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  organization  TEXT,
  specialties   TEXT[] DEFAULT '{}',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 강사 ↔ 과정
CREATE TABLE instructor_courses (
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (instructor_id, course_id)
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coaches_updated_at BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER instructors_updated_at BEFORE UPDATE ON instructors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
