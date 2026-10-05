import "server-only";

import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ErpError, erpGet, erpPath, erpPost } from "./erp";
import { clientOf } from "./shopper";

// Shopper sign-in. The accounts live in the brand ERP (D-522): this site keeps
// only its own next-auth session (a signed JWT cookie) naming the ERP account
// id, and sends that id back when it acts for the shopper. Staff never sign in
// here — they use the ERP console.
//
//   - Email and password: the credentials provider asks the ERP
//     (POST /storefront/v1/accounts/sign-in).
//   - Google: next-auth verifies Google's ID token (signature, audience, expiry,
//     state) during the OAuth callback; the verified claims are then sent to
//     the ERP (POST /storefront/v1/accounts/google), which signs in by Google's
//     account id, creates an account for a verified address, or links Google
//     to an existing *verified* account only.

function requestClient() {
  try {
    return clientOf(headers());
  } catch {
    return undefined;
  }
}

/** The ERP refusal as the code the login page understands. */
function signInCode(error) {
  if (!(error instanceof ErpError)) return "UNAVAILABLE";
  if (error.code === "ACCOUNT_EMAIL_UNVERIFIED") return "EMAIL_UNVERIFIED";
  if (error.code === "ACCOUNT_CREDENTIALS_INVALID" || error.code === "VALIDATION_FAILED") return "INVALID_CREDENTIALS";
  if (error.code === "RATE_LIMITED") return "RATE_LIMITED";
  return "UNAVAILABLE";
}

function sessionUser(account, image = null) {
  return {
    id: account.id,
    name: account.name || account.email,
    email: account.email,
    image,
    emailVerified: !!account.emailVerified,
  };
}

const providers = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, req) {
      const email = String(credentials?.email || "").trim().toLowerCase();
      const password = String(credentials?.password || "");
      if (!email || !password) throw new Error("INVALID_CREDENTIALS");
      const client = clientOf(req) || requestClient();
      try {
        const { body } = await erpPost(erpPath("/accounts/sign-in"), { email, password, ...(client ? { client } : {}) });
        return sessionUser(body.account);
      } catch (error) {
        throw new Error(signInCode(error));
      }
    },
  }),
];

// Google is offered only when this deploy has its own OAuth client.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

async function googleAccount(profile) {
  const client = requestClient();
  const locale = String(profile.locale || "").toLowerCase().startsWith("bn") ? "bn" : "en";
  const { body } = await erpPost(erpPath("/accounts/google"), {
    email: String(profile.email).trim().toLowerCase(),
    emailVerified: true,
    googleSub: String(profile.sub),
    ...(profile.name ? { name: String(profile.name).slice(0, 120) } : {}),
    locale,
    ...(client ? { client } : {}),
  });
  return body.account;
}

export const authOptions = {
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      // Only an address Google itself has verified is ever sent on (D-522).
      if (!profile?.email || profile.email_verified !== true || !profile.sub) {
        return "/auth/login?error=GOOGLE_NOT_VERIFIED";
      }
      try {
        const erpAccount = await googleAccount(profile);
        // Carried to the jwt callback on the same object (no adapter: next-auth
        // passes this user through unchanged).
        user.erpAccount = erpAccount;
        return true;
      } catch (error) {
        if (error instanceof ErpError && error.code === "ACCOUNT_EMAIL_UNVERIFIED") return "/auth/login?error=GOOGLE_EMAIL_UNVERIFIED";
        if (error instanceof ErpError && error.code === "ACCOUNT_GOOGLE_CONFLICT") return "/auth/login?error=GOOGLE_CONFLICT";
        if (error instanceof ErpError && error.code === "RATE_LIMITED") return "/auth/login?error=RATE_LIMITED";
        console.error("[auth] Google sign-in via the ERP failed:", error?.code || error?.message);
        return "/auth/login?error=UNAVAILABLE";
      }
    },
    async jwt({ token, user, account, profile, trigger }) {
      if (user) {
        if (account?.provider === "google") {
          const erpAccount = user.erpAccount || (await googleAccount(profile));
          const shaped = sessionUser(erpAccount, profile?.picture || user.image || null);
          token.id = shaped.id;
          token.name = shaped.name;
          token.email = shaped.email;
          token.picture = shaped.image;
          token.emailVerified = shaped.emailVerified;
        } else {
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
          token.picture = null;
          token.emailVerified = user.emailVerified;
        }
      } else if (trigger === "update" && token.id) {
        // The profile page changed the name: read it back from the ERP.
        try {
          const { account: erpAccount } = await erpGet(erpPath(`/accounts/${token.id}`), { cache: false });
          token.name = erpAccount.name || token.name;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture || null;
        session.user.emailVerified = !!token.emailVerified;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  return { error: null, session };
}
