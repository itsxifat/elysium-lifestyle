import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { deleteImageIfUnreferenced } from "@/lib/images";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const user = await User.findById(session.user.id).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image || null,
    phone: user.phone || "",
    address: user.address || {},
  });
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, phone, image, address } = await request.json();
  await connectDB();

  const update = {};
  if (name)    update.name = name.trim();
  if (phone !== undefined) update.phone = phone.trim();
  if (image !== undefined) update.image = image;
  if (address) update.address = address;

  // When the avatar changes, delete the previous one from the CDN
  // (no-ops for external avatars like Google sign-in photos).
  let previousImage;
  if (image !== undefined) {
    const before = await User.findById(session.user.id).select("image").lean();
    previousImage = before?.image;
  }

  await User.findByIdAndUpdate(session.user.id, { $set: update });

  if (previousImage && previousImage !== image) {
    await deleteImageIfUnreferenced(previousImage);
  }
  return NextResponse.json({ success: true });
}
