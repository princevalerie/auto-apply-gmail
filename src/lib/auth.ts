import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { upsertUser } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }) {
      // Persist the OAuth access_token and refresh_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      if (user && token?.sub) {
        try {
          await upsertUser({
            id: token.sub,
            name: user.name,
            email: user.email,
            image: user.image,
          });
        } catch (dbErr) {
          console.warn("[Auth] Failed to upsert user on JWT:", dbErr);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.sub) {
        session.user.id = token.sub;
      }
      // Send properties to the client, like an access_token and refresh_token from a provider.
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      }
      if (token.refreshToken) {
        session.refreshToken = token.refreshToken as string;
      }
      return session;
    },
  },
});

