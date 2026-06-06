import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { connectDB } from "./mongoose";
import User from "@/models/User";
import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "./rate-limit";

export const authOptions = {
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
        const rl = rateLimit(`login:${ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
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
          await User.findOneAndUpdate(
            { email: user.email },
            {
              $setOnInsert: { name: user.name, email: user.email, role: "customer", image: user.image },
              $set: { emailVerified: true },
            },
            { upsert: true, new: true }
          );
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
          const dbUser = await User.findOne({ email: user.email }).select("role emailVerified image").lean();
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.role = dbUser.role;
            token.emailVerified = dbUser.emailVerified;
            token.picture = dbUser.image || user.image || null;
          }
        } else {
          token.id = user.id;
          token.role = user.role;
          token.emailVerified = user.emailVerified;
          token.picture = user.image || null;
        }
      } else if (token.id) {
        try {
          await connectDB();
          const dbUser = await User.findById(token.id).select("role emailVerified image").lean();
          if (dbUser) {
            token.role = dbUser.role;
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

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  return { error: null, session };
}

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  return { error: null, session };
}
