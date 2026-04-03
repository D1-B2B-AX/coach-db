export interface NotionCoach {
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  skill_stack: string[];
  portfolio_url: string;
  notion_url: string;
  available_fields: string[];
  availability_detail: string;
  availability_period: string;
  notes: string;
  subjects: string[];
  availability_status: "available" | "unavailable" | null;
}

const NOTION_API_KEY = process.env.NOTION_API_KEY!;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID!;
const NOTION_DATABASE_ID_2025 = process.env.NOTION_DATABASE_ID_2025!;
const NOTION_INCLUDE_2025 = process.env.NOTION_INCLUDE_2025 === "true";

interface NotionRichText {
  plain_text: string;
}

interface NotionMultiSelectOption {
  name: string;
}

interface NotionSelectOption {
  name: string;
}

interface NotionProperty {
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  multi_select?: NotionMultiSelectOption[];
  select?: NotionSelectOption | null;
}

interface NotionPage {
  url: string;
  properties: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

const EXCLUDED_TYPE_TAGS = new Set(["기존", "신규", "취소"]);

function getText(property: NotionProperty | undefined): string {
  if (!property) return "";
  if (property.type === "title" && property.title) {
    return property.title.map((t) => t.plain_text).join("");
  }
  if (property.type === "rich_text" && property.rich_text) {
    return property.rich_text.map((t) => t.plain_text).join("");
  }
  return "";
}

function getSelect(property: NotionProperty | undefined): string {
  if (!property || property.type !== "select" || !property.select) return "";
  return property.select.name;
}

function getMultiSelect(property: NotionProperty | undefined): string[] {
  if (!property || property.type !== "multi_select" || !property.multi_select) {
    return [];
  }
  return property.multi_select.map((o) => o.name);
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,/\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeTypeTags(values: string[]): string[] {
  return [...new Set(values.filter((v) => !EXCLUDED_TYPE_TAGS.has(v.trim())))];
}

function parseTypeTags(property: NotionProperty | undefined): string[] {
  if (!property) return [];
  if (property.type === "multi_select") return getMultiSelect(property);
  return splitTags(getText(property));
}

function sanitizeHistoryNote(raw: string): string {
  if (!raw) return "";
  const cleaned = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/삼전\s*전용으로.*$/g, "").trim())
    .filter(Boolean);
  return cleaned.join("\n");
}

async function fetchAllPages(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined = undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error (${res.status}): ${text}`);
    }

    const data: NotionQueryResponse = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

function parse2026Coach(page: NotionPage): NotionCoach {
  const p = page.properties;
  // 근무 유형 + 유형을 합치고, 기존/신규/취소만 제외
  const subjects = normalizeTypeTags([
    ...parseTypeTags(p["근무 유형"]),
    ...parseTypeTags(p["근무유형"]),
    ...parseTypeTags(p["유형"]),
  ]);
  const historyRaw = getText(p[" 특이사항 / 히스토리"]) || getText(p["특이사항 / 히스토리"]);
  return {
    name: getText(p["이름"]),
    phone: getText(p["연락처"]),
    email: getText(p["이메일"]),
    birth_date: getText(p["생년월일"]),
    organization: getText(p["소속"]),
    skill_stack: getMultiSelect(p["가능 커리큘럼"]),
    portfolio_url: getText(p["이력서 및 포트폴리오"]),
    notion_url: page.url,
    available_fields: getMultiSelect(p["교육 및 가능 분야"]),
    availability_detail: getText(p["근무 가능 세부 내용"]),
    availability_period: getMultiSelect(p["근무 가능 기간"]).join(", "),
    notes: sanitizeHistoryNote(historyRaw),
    subjects,
    availability_status: null,
  };
}

function parse2025Coach(page: NotionPage): NotionCoach {
  const p = page.properties;

  // Parse "연락처 (번호&메일)" — formats: "email / phone", "email/phone", "phone / email"
  const contactRaw = getText(p["연락처 (번호&메일)"]);
  let phone = "";
  let email = "";
  if (contactRaw) {
    const parts = contactRaw.split(/\s*\/\s*/).map((s) => s.trim());
    for (const part of parts) {
      if (part.startsWith("010") || /^0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}$/.test(part)) {
        phone = part;
      } else if (part.includes("@")) {
        email = part;
      }
    }
  }

  // Merge 가능 커리큘럼 + 보유 스킬 (deduplicated)
  const curriculum = getMultiSelect(p["가능 커리큘럼"]);
  const ownedSkills = getMultiSelect(p["보유 스킬"]);
  const skillSet = new Set([...curriculum, ...ownedSkills]);

  // 활동 상태 (빈 이름 필드)
  const statusRaw = getSelect(p[""]);
  const availability_status = statusRaw === "활동중" ? "available" as const
    : statusRaw === "미활동중" || statusRaw === "탈락" ? "unavailable" as const
    : null;

  return {
    name: getText(p["이름"]),
    phone,
    email,
    birth_date: getText(p["생년월일"]),
    organization: getText(p["소속"]),
    skill_stack: [...skillSet],
    portfolio_url: getText(p["비고/참고사항"]),
    notion_url: page.url,
    available_fields: getMultiSelect(p["가능분야"]),
    availability_detail: getText(p["가능 여부 특이사항"]),
    availability_period: "",
    notes: "",
    subjects: normalizeTypeTags(parseTypeTags(p["유형"])),
    availability_status,
  };
}

export async function fetchNotionCoaches(): Promise<NotionCoach[]> {
  // 기본은 2026 DB만 사용. 2025 DB는 명시적으로 켰을 때만 포함.
  const pages2026 = await fetchAllPages(NOTION_DATABASE_ID);
  const pages2025 = NOTION_INCLUDE_2025
    ? await fetchAllPages(NOTION_DATABASE_ID_2025)
    : [];

  // Build map from 2026ver (primary) — 2026 DB에 있으면 available
  const coachMap = new Map<string, NotionCoach>();
  const in2026 = new Set<string>();
  for (const page of pages2026) {
    const coach = parse2026Coach(page);
    if (coach.name) {
      coach.availability_status = "available";
      coachMap.set(coach.name, coach);
      in2026.add(coach.name);
    }
  }

  // Merge 2025ver (명시적으로 켠 경우만)
  if (NOTION_INCLUDE_2025) {
    for (const page of pages2025) {
      const coach2025 = parse2025Coach(page);
      if (!coach2025.name) continue;

      const existing = coachMap.get(coach2025.name);
      if (existing) {
        // Fill missing fields from 2025ver
        if (!existing.phone && coach2025.phone) existing.phone = coach2025.phone;
        if (!existing.email && coach2025.email) existing.email = coach2025.email;
        if (!existing.birth_date && coach2025.birth_date)
          existing.birth_date = coach2025.birth_date;
        if (!existing.organization && coach2025.organization)
          existing.organization = coach2025.organization;
        if (existing.skill_stack.length === 0 && coach2025.skill_stack.length > 0)
          existing.skill_stack = coach2025.skill_stack;
        if (!existing.portfolio_url && coach2025.portfolio_url)
          existing.portfolio_url = coach2025.portfolio_url;
        if (existing.available_fields.length === 0 && coach2025.available_fields.length > 0)
          existing.available_fields = coach2025.available_fields;
        if (!existing.availability_detail && coach2025.availability_detail)
          existing.availability_detail = coach2025.availability_detail;
        if (!existing.availability_period && coach2025.availability_period)
          existing.availability_period = coach2025.availability_period;
        // Merge subjects (union)
        existing.subjects = [...new Set([...existing.subjects, ...coach2025.subjects])];
        // 2026 DB에 있으면 무조건 available 유지 (2025 상태로 덮어쓰지 않음)
      } else {
        // Only in 2025ver — 2026에 없으므로 unavailable
        coach2025.availability_status = "unavailable";
        coachMap.set(coach2025.name, coach2025);
      }
    }
  }

  return Array.from(coachMap.values());
}
