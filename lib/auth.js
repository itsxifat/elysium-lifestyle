import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { connectDB } from "./mongoose";
import User from "@/models/User";
import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "./rate-limit";
import { isStaff, isElevated, hasPermission } from "./permissions";
import { bindSessionToSandbox } from "@enfinito/demo-kit/auth";

const baseAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }
        // Throttle brute-force / credential-stuffing by client IP.
        const ip = getClientIp(req);
        // Demo traffic arrives from shared NAT, so a per-IP limit of 8 locks out
        // unrelated visitors. The sandbox is disposable and the credentials are
        // published on the page, so brute force is not the threat there.
        const isDemo = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
        const rl = rateLimit(`login:${ip}`, {
          limit: isDemo ? 200 : 8,
          windowMs: 10 * 60 * 1000,
        });
        if (!rl.ok) {
          throw new Error("Too many login attempts. Please try again in a few minutes.");
        }
        await connectDB();
        const user = await User.findOne({ email: credentials.email }).select("+password");
        if (!user || !user.password) {
          throw new Error("No account found with this email");
        }
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) throw new Error("Invalid password");

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions || [],
          emailVerified: user.emailVerified,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          await connectDB();
          const dbUser = await User.findOneAndUpdate(
            { email: user.email },
            {
              $setOnInsert: { name: user.name, email: user.email, role: "customer", image: user.image },
              $set: { emailVerified: true },
            },
            { upsert: true, new: true }
          );
          // Google has verified this address. If it belonged to a guest stub
          // (a landing-page order placed before they ever signed up), promote it
          // now so they sign into the account that already holds their orders.
          if (dbUser?.isGuest) {
            const { completeGuestClaim } = await import("./customer-link");
            await completeGuestClaim(dbUser._id);
          }
        } catch (err) {
          console.error("[auth] Google signIn DB error:", err.message);
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          await connectDB();
          const dbUser = await User.findOne({ email: user.email }).select("role permissions emailVerified image").lean();
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.role = dbUser.role;
            token.permissions = dbUser.permissions || [];
            token.emailVerified = dbUser.emailVerified;
            token.picture = dbUser.image || user.image || null;
          }
        } else {
          token.id = user.id;
          token.role = user.role;
          token.permissions = user.permissions || [];
          token.emailVerified = user.emailVerified;
          token.picture = user.image || null;
        }
      } else if (token.id) {
        try {
          await connectDB();
          const dbUser = await User.findById(token.id).select("role permissions emailVerified image").lean();
          if (dbUser) {
            token.role = dbUser.role;
            token.permissions = dbUser.permissions || [];
            token.emailVerified = dbUser.emailVerified;
            token.picture = dbUser.image || token.picture || null;
          }
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.permissions = token.permissions || [];
        session.user.emailVerified = token.emailVerified;
        session.user.image = token.picture || null;
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

// Outside demo mode this is baseAuthOptions unchanged. Inside it, the session is
// pinned to its sandbox so a token that outlived a reap cannot carry a stale
// role into a fresh database. See @enfinito/demo-kit/auth.
export const authOptions = bindSessionToSandbox(baseAuthOptions);

const unauthorized = () => ({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null });
const forbidden = () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null });

// Admin-panel guard.
//   requireAdmin()                 → elevated tier only (superadmin/admin).
//   requireAdmin("orders.manage")  → elevated OR a staff member who holds that
//                                    permission (role default or per-user grant).
// The optional arg lets a single helper power both blanket-admin endpoints and
// fine-grained, permission-controlled ones. (Legacy callers pass `request`,
// which is ignored — only a string permission key is honoured.)
export async function requireAdmin(perm) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  const u = session.user;
  if (!isStaff(u.role)) return forbidden();
  if (isElevated(u.role)) return { error: null, session };
  if (typeof perm === "string" && hasPermission(u, perm)) return { error: null, session };
  return forbidden();
}

// Any admin-panel member (superadmin/admin/moderator/staff), regardless of perms.
export async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if (!isStaff(session.user.role)) return forbidden();
  return { error: null, session };
}

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  return { error: null, session };
}
