import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/api-auth";
import { generateAccessToken } from "@/lib/coach-auth";
import { normalizeWorkTypeString } from "@/lib/work-type";

async function authenticate(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === process.env.SYNC_API_SECRET) return true;
  }
  const auth = await requireManager();
  return auth !== null && auth.manager.role === "admin";
}

const NOTION_API_KEY = process.env.NOTION_API_KEY!;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID!;
const EXCLUDED_TYPE_TAGS = new Set(["기존", "신규", "취소"]);

function getText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title")
    return prop.title?.[0]?.plain_text || "";
  if (prop.type === "rich_text")
    return prop.rich_text?.map((t: any) => t.plain_text).join("") || "";
  if (prop.type === "multi_select")
    return prop.multi_select?.map((s: any) => s.name).join(", ") || "";
  if (prop.type === "select") return prop.select?.name || "";
  if (prop.type === "date") return prop.date?.start || "";
  return "";
}

function getMultiSelect(prop: any): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select?.map((s: any) => s.name).filter(Boolean) || [];
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,/\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTypeTags(prop: any): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") return getMultiSelect(prop);
  return splitTags(getText(prop));
}

function normalizeTypeTags(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => !EXCLUDED_TYPE_TAGS.has(v.trim()))));
}

function sanitizeHistoryNote(raw: string): string {
  if (!raw) return "";
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/삼전\s*전용으로.*$/g, "").trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/컨택\s*가능/.test(line) &&
        !/일정에\s*한해/.test(line) &&
        !/일정을\s*받고/.test(line),
    )
    .join("\n");
}

function parseBirthDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const m1 = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m1)
    return new Date(
      Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3])),
    );
  const m2 = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m2) {
    const y = Number(m2[1]);
    const year = y > 50 ? 1900 + y : 2000 + y;
    return new Date(Date.UTC(year, Number(m2[2]) - 1, Number(m2[3])));
  }
  return null;
}

async function fetchAllNotionPages() {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (data.results) pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function syncFromNotion(dryRun: boolean) {
  const pages = await fetchAllNotionPages();

  const logs: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const changes: Array<{
    name: string;
    action: "created" | "updated" | "skipped";
    details?: string;
    diffs?: Array<{ field: string; db: string | null; notion: string | null }> | null;
  }> = [];

  for (const page of pages) {
    const p = page.properties;
    const name = getText(p["이름"]);
    if (!name) {
      skipped++;
      continue;
    }

    const phone = getText(p["연락처"]) || null;
    const email = getText(p["이메일"]) || null;
    const birthDate = parseBirthDate(getText(p["생년월일"]));
    const affiliation = getText(p["소속"]) || null;

    const wtValues = normalizeTypeTags([
      ...parseTypeTags(p["근무 유형"]),
      ...parseTypeTags(p["근무유형"]),
      ...parseTypeTags(p["유형"]),
    ]);
    const workType = normalizeWorkTypeString(Array.from(new Set(wtValues)).join(", "));

    const fields = Array.from(
      new Set([
        ...getMultiSelect(p["교육 및 가능 분야"]),
        ...getMultiSelect(p["전문 분야"]),
      ]),
    );
    const curriculums = Array.from(new Set(getMultiSelect(p["가능 커리큘럼"])));

    const portfolioUrl = getText(p["이력서 및 포트폴리오"]) || null;

    const historyRaw =
      getText(p[" 특이사항 / 히스토리"]) ||
      getText(p["특이사항 / 히스토리"]);
    const selfNote = sanitizeHistoryNote(historyRaw) || null;

    const period = getText(p["근무 가능 기간"]);
    const detail = getText(p["근무 가능 세부 내용"]);
    const availParts: string[] = [];
    if (period) availParts.push(`근무 가능 기간: ${period}`);
    if (detail) availParts.push(detail);
    const availabilityDetail = availParts.join("\n") || null;

    const existing = await prisma.coach.findFirst({ where: { name } });

    if (dryRun) {
      const diffs: Array<{ field: string; db: string | null; notion: string | null }> = [];
      if (existing) {
        if (phone && phone !== existing.phone)
          diffs.push({ field: "연락처", db: existing.phone, notion: phone });
        if (email && email !== existing.email)
          diffs.push({ field: "이메일", db: existing.email, notion: email });
        if (workType && workType !== existing.workType)
          diffs.push({ field: "유형", db: existing.workType, notion: workType });
        if (affiliation && affiliation !== existing.affiliation)
          diffs.push({ field: "소속", db: existing.affiliation, notion: affiliation });
        if (portfolioUrl && portfolioUrl !== existing.portfolioUrl)
          diffs.push({ field: "포트폴리오", db: existing.portfolioUrl, notion: portfolioUrl });
        if (selfNote && selfNote !== existing.selfNote)
          diffs.push({ field: "특이사항", db: existing.selfNote?.slice(0, 50) ?? null, notion: selfNote.slice(0, 50) });
        if (availabilityDetail && availabilityDetail !== existing.availabilityDetail)
          diffs.push({ field: "가용정보", db: existing.availabilityDetail?.slice(0, 50) ?? null, notion: availabilityDetail.slice(0, 50) });
      }
      changes.push({
        name,
        action: existing ? "updated" : "created",
        diffs: existing ? (diffs.length > 0 ? diffs : null) : null,
        details: existing
          ? diffs.map((d) => d.field).join(", ") || "변경 없음"
          : undefined,
      });
      existing ? updated++ : created++;
      continue;
    }

    if (existing) {
      await prisma.coach.update({
        where: { id: existing.id },
        data: {
          phone: phone ?? existing.phone,
          email: email ?? existing.email,
          birthDate: birthDate ?? existing.birthDate,
          affiliation: affiliation ?? existing.affiliation,
          workType: workType ?? existing.workType,
          portfolioUrl: portfolioUrl ?? existing.portfolioUrl,
          selfNote: selfNote ?? existing.selfNote,
          availabilityDetail: availabilityDetail ?? existing.availabilityDetail,
        },
      });

      if (fields.length > 0) {
        await prisma.coachField.deleteMany({ where: { coachId: existing.id } });
        for (const fn of fields) {
          const field = await prisma.field.upsert({
            where: { name: fn },
            create: { name: fn },
            update: {},
          });
          await prisma.coachField.create({
            data: { coachId: existing.id, fieldId: field.id },
          });
        }
      }
      if (curriculums.length > 0) {
        await prisma.coachCurriculum.deleteMany({
          where: { coachId: existing.id },
        });
        for (const cn of curriculums) {
          const curr = await prisma.curriculum.upsert({
            where: { name: cn },
            create: { name: cn },
            update: {},
          });
          await prisma.coachCurriculum.create({
            data: { coachId: existing.id, curriculumId: curr.id },
          });
        }
      }

      logs.push(`↻ ${name}`);
      updated++;
    } else {
      const coach = await prisma.coach.create({
        data: {
          name,
          phone,
          email,
          birthDate,
          affiliation,
          workType,
          portfolioUrl,
          selfNote,
          availabilityDetail,
          status: "active",
          accessToken: generateAccessToken(),
        },
      });

      for (const fn of fields) {
        const field = await prisma.field.upsert({
          where: { name: fn },
          create: { name: fn },
          update: {},
        });
        await prisma.coachField.create({
          data: { coachId: coach.id, fieldId: field.id },
        });
      }
      for (const cn of curriculums) {
        const curr = await prisma.curriculum.upsert({
          where: { name: cn },
          create: { name: cn },
          update: {},
        });
        await prisma.coachCurriculum.create({
          data: { coachId: coach.id, curriculumId: curr.id },
        });
      }

      logs.push(`+ ${name}`);
      created++;
    }
  }

  return { notionCount: pages.length, created, updated, skipped, logs, changes };
}

// GET: dry-run (diff 확인)
export async function GET(request: NextRequest) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await syncFromNotion(true);
  return NextResponse.json({
    dryRun: true,
    notionCount: result.notionCount,
    toCreate: result.created,
    toUpdate: result.updated,
    skipped: result.skipped,
    changes: result.changes,
  });
}

// POST: 실제 동기화 실행
export async function POST(request: NextRequest) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await syncFromNotion(false);
  return NextResponse.json({
    success: true,
    notionCount: result.notionCount,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    logs: result.logs,
  });
}
