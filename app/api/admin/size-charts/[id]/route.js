import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import SizeChart from "@/models/SizeChart";
import { requireAdmin } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    await connectDB();
    const chart = await SizeChart.findById(params.id).lean();
    if (!chart) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chart);
  } catch {
    return NextResponse.json({ error: "Failed to fetch size chart" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const data = await request.json();
    const chart = await SizeChart.findByIdAndUpdate(params.id, data, { new: true, runValidators: true }).lean();
    if (!chart) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chart);
  } catch {
    return NextResponse.json({ error: "Failed to update size chart" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const chart = await SizeChart.findByIdAndDelete(params.id);
    if (!chart) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch {
    return NextResponse.json({ error: "Failed to delete size chart" }, { status: 500 });
  }
}
