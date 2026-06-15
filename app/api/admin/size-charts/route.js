import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import SizeChart from "@/models/SizeChart";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const charts = await SizeChart.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json(charts);
  } catch {
    return NextResponse.json({ error: "Failed to fetch size charts" }, { status: 500 });
  }
}

export async function POST(request) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();
    if (!data.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const chart = await SizeChart.create(data);
    return NextResponse.json(chart, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create size chart" }, { status: 500 });
  }
}
