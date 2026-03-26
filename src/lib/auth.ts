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
    async session({ session }) {
      if (session.user?.email) {
        const manager = await prisma.manager.findUnique({
          where: { email: session.user.email },
        })
        if (manager) {
          ;(session as any).managerId = manager.id
          ;(session as any).managerRole = manager.role
        }
      }
      return session
    },
  },
})
