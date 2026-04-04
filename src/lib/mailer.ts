import nodemailer from 'nodemailer'

const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null

interface SendMailParams {
  to: string
  subject: string
  body: string
  replyTo?: string
}

export async function sendMail({ to, subject, body, replyTo }: SendMailParams) {
  if (!transporter) {
    console.warn('[mailer] GMAIL_USER/GMAIL_APP_PASSWORD not set, skipping email')
    return
  }

  await transporter.sendMail({
    from: `"코치관리" <${GMAIL_USER}>`,
    to,
    replyTo,
    subject,
    html: body,
  })
}

const BASE_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://coach.day1company.co.kr'

interface EmailTemplateData {
  managerName?: string
  managerEmail?: string
  coachName?: string
  date?: string
  courseName?: string
  clickUrl: string
}

function wrap(content: string) {
  return `<div style="font-family:'Pretendard',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#333">${content}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa">코치관리 시스템 자동 발송</div></div>`
}

export function buildEmail(
  type: string,
  data: EmailTemplateData,
): { subject: string; body: string; replyTo?: string } | null {
  const link = `<a href="${BASE_URL}${data.clickUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1976D2;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">확인하기</a>`

  switch (type) {
    case 'scouting_request':
      return {
        subject: `[섭외 요청] ${data.managerName}매니저 — ${data.date}`,
        body: wrap(`
          <h2 style="font-size:18px;margin:0 0 12px">섭외 요청이 도착했습니다</h2>
          <p style="font-size:14px;line-height:1.6;margin:0">
            <strong>${data.managerName}</strong>매니저가 <strong>${data.date}</strong> 일정으로 섭외를 요청했습니다.
          </p>
          ${link}
        `),
        replyTo: data.managerEmail,
      }

    case 'engagement_confirmed':
      return {
        subject: `[투입 확정] ${data.date} ${data.courseName || ''}`,
        body: wrap(`
          <h2 style="font-size:18px;margin:0 0 12px">투입이 확정되었습니다</h2>
          <p style="font-size:14px;line-height:1.6;margin:0">
            <strong>${data.date}</strong> 일정이 확정되었습니다.${data.courseName ? `<br/>과정: <strong>${data.courseName}</strong>` : ''}
          </p>
          ${link}
        `),
      }

    case 'engagement_cancelled':
      return {
        subject: `[투입 취소] ${data.date}`,
        body: wrap(`
          <h2 style="font-size:18px;margin:0 0 12px">투입이 취소되었습니다</h2>
          <p style="font-size:14px;line-height:1.6;margin:0">
            <strong>${data.date}</strong> 투입 일정이 취소되었습니다.
          </p>
          ${link}
        `),
      }

    case 'coach_accepted':
      return {
        subject: `[코치 수락] ${data.coachName} — ${data.date}`,
        body: wrap(`
          <h2 style="font-size:18px;margin:0 0 12px">코치가 섭외를 수락했습니다</h2>
          <p style="font-size:14px;line-height:1.6;margin:0">
            <strong>${data.coachName}</strong>님이 <strong>${data.date}</strong> 섭외를 수락했습니다.
          </p>
          ${link}
        `),
      }

    case 'coach_rejected':
      return {
        subject: `[코치 거절] ${data.coachName} — ${data.date}`,
        body: wrap(`
          <h2 style="font-size:18px;margin:0 0 12px">코치가 섭외를 거절했습니다</h2>
          <p style="font-size:14px;line-height:1.6;margin:0">
            <strong>${data.coachName}</strong>님이 <strong>${data.date}</strong> 섭외를 거절했습니다.
          </p>
          ${link}
        `),
      }

    default:
      return null
  }
}
