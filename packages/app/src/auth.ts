import NextAuth from "next-auth";
import { decode, encode } from "next-auth/jwt";
import Google from "next-auth/providers/google";

const ALLOW_EMAILS = new Set(
  process.env.ALLOW_EMAILS?.split(",")
    .map((split) => split.trim().toLowerCase())
    .filter(Boolean),
);

const isProduction = process.env.NODE_ENV === "production";

export const { handlers, signIn, signOut, auth } = NextAuth({
  callbacks: {
    async signIn({ profile }) {
      if (!ALLOW_EMAILS.has(profile?.email ?? "")) {
        return "/forbidden";
      }
      return true;
    },
  },
  cookies: {
    sessionToken: {
      options: {
        domain: isProduction ? ".photo.sendo-app.com" : undefined,
      },
    },
  },
  jwt: {
    decode: async ({ token, secret }) => {
      return decode({ salt: process.env.AUTH_SALT ?? "", secret, token });
    },
    encode: async ({ token, secret }) => {
      return encode({ salt: process.env.AUTH_SALT ?? "", secret, token });
    },
  },
  providers: [Google],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
});
