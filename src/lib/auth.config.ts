import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"

/**
 * Edge-compatible auth config (no Prisma / Node.js imports).
 * Used by middleware for lightweight session checking.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: "day1company.co.kr",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
}
