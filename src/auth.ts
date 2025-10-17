import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOW_EMAILS = new Set(
  (process.env.ALLOW_EMAILS ?? "")
    .split(",")
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
  secret: process.env.AUTH_SECRET,
});
