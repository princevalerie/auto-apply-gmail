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
      if (user) {
        token.id = user.id || token.sub || user.email;
      }

      const effectiveId = (token.sub || token.id || token.email || user?.email || "") as string;
      if (effectiveId && (user || account)) {
        try {
          await upsertUser({
            id: effectiveId,
            name: (user?.name || token.name || "") as string,
            email: (user?.email || token.email || "") as string,
            image: (user?.image || token.picture || "") as string,
          });
        } catch (dbErr) {
          console.warn("[Auth] Failed to upsert user on JWT:", dbErr);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub || token.id || session.user.email || "") as string;
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

