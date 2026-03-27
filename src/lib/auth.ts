import NextAuth from "next-auth"
import { prisma } from "./prisma"
import { authConfig } from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
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
