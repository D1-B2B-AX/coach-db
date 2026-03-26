import { google } from "googleapis";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get(
    { fileId: process.env.GOOGLE_SHEET_ID!, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const wb = XLSX.read(response.data as ArrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n.includes("조교실습코치_일반계약요청")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  // M열(12) 샘플 + 파싱 테스트
  const samples: unknown[] = [];
  for (let i = 1; i < Math.min(rows.length, 50); i++) {
    const mCol = String(rows[i][12] ?? "").trim();
    if (!mCol) continue;

    // 시간 추출 테스트
    const timeMatch = mCol.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);

    samples.push({
      row: i,
      name: rows[i][4],
      course: rows[i][7],
      m_col: mCol.slice(0, 200),
      time_found: timeMatch ? `${timeMatch[1]}~${timeMatch[2]}` : null,
    });
  }

  return NextResponse.json({ total_rows: rows.length, samples });
}
