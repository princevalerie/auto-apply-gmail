import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFileToS3 } from "@/lib/s3";
import { saveFileRecord, upsertUser } from "@/lib/db";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileType = (formData.get("fileType") as string) || "cv"; // 'cv' or 'portfolio'

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "File type not supported" }, { status: 400 });
    }

    // Maximum size: 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 10MB limit" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure user exists in database
    await upsertUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    });

    // Upload to S3 storage
    const s3Result = await uploadFileToS3({
      userId: session.user.id,
      fileType: fileType as "cv" | "portfolio",
      fileName: file.name,
      fileBuffer: buffer,
      mimeType: file.type,
    });

    // Save file metadata to database
    await saveFileRecord({
      userId: session.user.id,
      fileType: fileType as "cv" | "portfolio",
      fileName: file.name,
      fileUrl: s3Result.url,
      fileSize: file.size,
      mimeType: file.type,
    });

    return NextResponse.json({
      url: s3Result.url,
      key: s3Result.key,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
