import { google } from "googleapis"

const SPREADSHEET_ID = "1D5qUeVZjRDnNMPXGP2aXSn3Q-qH_AiFuzTnwFWUGykg"
const BASE_URL = "https://coach-db.skillflo.app/coach?token="

const coaches = [
  { name: "이다언", email: "cmsg_hbg2@naver.com", token: "a22fa27cc7722b23edc98cd0d69b138ecfbe085583a9a98d7bdcf4eb16c460b4" },
  { name: "박요한", email: "ticonweb@gmail.com", token: "ce04ff026b8f621b41c6d69ca6afcf60f09f3bffd96ad5f490330a5ac220b8ad" },
  { name: "양정무", email: "jeongmuya@gmail.com", token: "3930ddd0a9f15df4a9baa21da1b10fb1d927c4e892d1f500a28a7652e2673004" },
  { name: "박건민", email: "qkrrjsas@gmail.com", token: "f7de6fda9d9139fde99f96db8778816f1537d5d192cca64f0d6eb14898da8527" },
  { name: "박지현", email: "j.park.77717@gmail.com", token: "c5db5c51c5ceae0e69bf29c256185406b522704f3dc4d56d3a0119bed7ba059c" },
  { name: "김시은", email: "watasieun@gmail.com", token: "2eba8b7d527f094573294a0d191a7ff8681c0f763cb769aba9b15bd2866af594" },
  { name: "김예인", email: "dpdls1021@gmail.com", token: "b70a627e19aa360a31a28b70bb3642a0cc79612dbe8e67b40f9a67cb4514fae9" },
  { name: "김윤겸", email: "dbsrua110525@gmail.com", token: "a084bb9494b422b1db1ec7f6b3abc24bf516beaea0a01b42b43e5f4a14b89b57" },
  { name: "박범찬", email: "bumchan2828@gmail.com", token: "0a338e26a4708e35bc97c9c584bd6da24ea6539a418e4055bd4349949d0d8a66" },
  { name: "강병민", email: "kambing0629@naver.com", token: "db001636e60bac2f38caa0cc638b705466e23e1932f2627e4df4d6041d0ffbbe" },
  { name: "최연아", email: "choiyuna759@gmail.com", token: "dcd7fba20a21093a3d896eb6ccf0655dc3d334cec77c86df99bbe05f1aa0476e" },
  { name: "조윤주", email: "jyjjj0510@gmail.com", token: "7ef4642838d763fa99d9d2be49b0029afc23b8b7157069652a58b8487791be8b" },
  { name: "석은규", email: "eunkyu324@gmail.com", token: "e61f72b1335202ec3e2a2852a8612e72056219e42e3f4d33217549d44a7ba653" },
  { name: "김세진", email: "sejin3004@naver.com", token: "4b623047c99ea0bf9b9846f0aba87a64703e917dda554e07650f6b9a3b841281" },
  { name: "정수진", email: "jiji501@naver.com", token: "aed95916d21de016d76fc4e566a2e3053c555221e3749cddc5256cf04c2a615a" },
  { name: "이승규", email: "leesk3732@naver.com", token: "30d0fe47a57b04d3ce36b08ed6dbfe2740226da5c59a18bb2e7165885d9ffd0c" },
  { name: "권문진", email: "juliaanswls@naver.com", token: "790a1b4eaadd5cefa61eb5bbdefe6270ded7a8144f9ccdaec0c3c82280bb60c6" },
  { name: "문국현", email: "moonstalker9010@gmail.com", token: "511cff74b64c990f281b782cc5637ae2ac29a126fb4af8f0e70605d77605ccc2" },
  { name: "방승욱", email: "b84421054@gmail.com", token: "d65635384adfa9c84892faf3dd26d781253611432baf06af8f21ca9aa3184aa4" },
  { name: "이영인", email: "leeyi.yy@gmail.com", token: "e97af4cade893c464ea23f6a59e963e14832020dadfa5f3b1092965887322dbc" },
  { name: "김가은", email: "(DB 추가 예정)", token: "" },
]

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  const sheets = google.sheets({ version: "v4", auth })

  const header = ["번호", "이름", "이메일", "마이페이지 URL"]
  const rows = coaches.map((c, i) => [
    i + 1,
    c.name,
    c.email,
    c.token ? BASE_URL + c.token : "(DB 추가 후 업데이트)",
  ])

  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "시트1!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [header, ...rows] },
  }, { timeout: 30000 })

  console.log("Updated:", res.data.updatedCells, "cells")
}
main()
