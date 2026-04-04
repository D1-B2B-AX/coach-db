import { google } from "googleapis";
import * as XLSX from "xlsx";

interface SheetRow {
  employee_id: string;
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  subjects: string;
  notion_url: string;
  portfolio_url: string;
  course_name: string;
  start_date: string;
  end_date: string;
}

export async function fetchSheetData(): Promise<SheetRow[]> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const drive = google.drive({ version: "v3", auth });

  // .xls/.xlsx 파일을 바이너리로 다운로드
  const response = await drive.files.get(
    {
      fileId: process.env.GOOGLE_SHEET_ID!,
      alt: "media",
    },
    { responseType: "arraybuffer" }
  );

  const workbook = XLSX.read(response.data as ArrayBuffer, { type: "array" });

  // 조교/실습코치 시트 찾기
  const sheetName =
    workbook.SheetNames.find((n) => n.includes("조교실습코치_일반계약요청")) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (rows.length <= 1) return []; // 헤더만 있거나 비어있으면

  // 컬럼 매핑 (조교실습코치_일반계약요청 시트 기준)
  // A(0):계약서발송, B(1):신규조교, C(2):No., D(3):사번, E(4):성명,
  // F(5):담당직무, G(6):담당Manager, H(7):과정명, I(8):시급,
  // J(9):고용시작일, K(10):고용종료일, L(11):퇴사일, M(12):근로시간,
  // N(13):이메일, O(14):연락처, P(15):연락처뒷자리, Q(16):비고
  return rows
    .slice(1) // 헤더 제외
    .filter((row) => row[3] && !String(row[3]).includes("취소") && String(row[3]).trim() !== "-"
      && !String(row[0] ?? "").includes("취소") && !String(row[7] ?? "").includes("취소"))
    .map((row) => ({
      employee_id: String(row[3] ?? "").trim().replace(/-\d+$/, ""),
      name: String(row[4] ?? "").trim(),
      phone: String(row[14] ?? "").trim(),
      email: String(row[13] ?? "").trim(),
      birth_date: "",
      organization: "",
      subjects: String(row[5] ?? "").trim(),
      notion_url: "",
      portfolio_url: "",
      course_name: String(row[7] ?? "").trim(),
      start_date: String(row[9] ?? "").trim(),
      end_date: String(row[10] ?? "").trim(),
    }));
}

const CONTRACT_SHEET_ID = "1hl6VxXYN1kJoQlRCpbpyWV2PFsu3LhFQ"
const CONTRACT_SHEET_NAME = "조교실습코치_일반계약요청"

export async function appendToContractSheet(rows: string[][]) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets = google.sheets({ version: "v4", auth })
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: CONTRACT_SHEET_ID,
    range: `${CONTRACT_SHEET_NAME}!A:Q`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  })

  const updatedRange = res.data.updates?.updatedRange ?? ""
  const rangeMatch = updatedRange.match(/!A(\d+):/)
  const startRow = rangeMatch ? parseInt(rangeMatch[1], 10) : null
  return { updatedRows: res.data.updates?.updatedRows ?? 0, startRow }
}

export interface GroupedCoach {
  employee_id: string;
  employee_ids: string[];
  name: string;
  phone: string;
  email: string;
  birth_date: string;
  organization: string;
  subjects: string[];
  notion_url: string;
  portfolio_url: string;
  course_names: string[];
  course_dates: { name: string; start_date: string; end_date: string }[];
}

export function groupByCoach(rows: SheetRow[]): GroupedCoach[] {
  const map = new Map<string, GroupedCoach>();

  for (const row of rows) {
    const existing = map.get(row.employee_id);
    if (existing) {
      if (row.course_name && !existing.course_names.includes(row.course_name)) {
        existing.course_names.push(row.course_name);
        existing.course_dates.push({
          name: row.course_name,
          start_date: row.start_date,
          end_date: row.end_date,
        });
      }
    } else {
      map.set(row.employee_id, {
        employee_id: row.employee_id,
        employee_ids: [row.employee_id],
        name: row.name,
        phone: row.phone,
        email: row.email,
        birth_date: row.birth_date,
        organization: row.organization,
        subjects: row.subjects
          ? row.subjects.split(",").map((s) => s.trim())
          : [],
        notion_url: row.notion_url,
        portfolio_url: row.portfolio_url,
        course_names: row.course_name ? [row.course_name] : [],
        course_dates: row.course_name
          ? [{ name: row.course_name, start_date: row.start_date, end_date: row.end_date }]
          : [],
      });
    }
  }

  // 2차: 이름 + 연락처/이메일이 같으면 동일인으로 병합
  const coaches = Array.from(map.values());
  const merged: GroupedCoach[] = [];
  const used = new Set<string>();

  for (const coach of coaches) {
    if (used.has(coach.employee_id)) continue;

    const base = { ...coach };

    for (const other of coaches) {
      if (other.employee_id === coach.employee_id || used.has(other.employee_id)) continue;
      if (base.name !== other.name) continue;

      const samePhone = base.phone && other.phone && base.phone === other.phone;
      const sameEmail = base.email && other.email && base.email === other.email;

      if (samePhone || sameEmail) {
        base.employee_ids.push(...other.employee_ids);
        if (!base.phone && other.phone) base.phone = other.phone;
        if (!base.email && other.email) base.email = other.email;
        for (const cn of other.course_names) {
          if (!base.course_names.includes(cn)) {
            base.course_names.push(cn);
            const cd = other.course_dates.find((d) => d.name === cn);
            if (cd) base.course_dates.push(cd);
          }
        }
        used.add(other.employee_id);
      }
    }

    base.employee_ids.sort();
    base.employee_id = base.employee_ids.join(", ");
    merged.push(base);
  }

  return merged;
}
