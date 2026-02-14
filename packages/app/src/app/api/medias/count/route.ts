import { NextResponse } from "next/server";
import { countAllObjects } from "@/lib/services/s3-service";

export async function GET() {
  try {
    const totalCount = await countAllObjects();

    return NextResponse.json({ count: totalCount });
  } catch (error) {
    console.error("Error counting medias:", error);
    return NextResponse.json(
      { error: "Failed to count medias" },
      { status: 500 },
    );
  }
}
