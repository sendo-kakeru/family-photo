import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "./lib/env";

const ALLOW_EMAILS = new Set(
  env.ALLOW_EMAILS.split(",")
    .map((split) => split.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  callbacks: {
    async signIn({ profile }) {
      if (!ALLOW_EMAILS.has(profile?.email ?? "")) {
        return "/forbidden";
      }
      return true;
    },
  },
  providers: [Google],
  secret: env.AUTH_SECRET,
  trustHost: true,
});
