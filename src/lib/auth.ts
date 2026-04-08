import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./prisma"
import { authConfig } from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    ...(process.env.NODE_ENV !== "production"
      ? [
          Credentials({
            id: "test-credentials",
            credentials: { email: { type: "email" } },
            async authorize(credentials) {
              const email = (credentials?.email as string)?.trim()
              if (!email) return null
              const manager = await prisma.manager.findUnique({
                where: { email },
                select: { id: true, email: true, name: true, role: true },
              })
              if (!manager || manager.role === "blocked") return null
              return { id: manager.id, email: manager.email, name: manager.name }
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      if (!user.email?.endsWith("@day1company.co.kr")) return false

      const manager = await prisma.manager.findUnique({
        where: { email: user.email },
      })

      if (manager?.role === "blocked") return false

      if (!manager) {
        await prisma.manager.create({
          data: {
            email: user.email,
            name: user.name || "",
            googleId: (profile as any)?.sub || "",
          },
        })
      }

      return true
    },
    async jwt({ token }) {
      if (token.email) {
        const manager = await prisma.manager.findUnique({
          where: { email: token.email },
          select: { id: true, role: true },
        })
        if (manager) {
          token.managerId = manager.id
          token.managerRole = manager.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        ;(session as any).managerId = token.managerId
        ;(session as any).managerRole = token.managerRole
      }
      return session
    },
  },
})
