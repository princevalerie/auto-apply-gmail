import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserFiles, deleteUserFile, getUserFile } from "@/lib/db";
import { deleteFileFromS3Url } from "@/lib/s3";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user.id || session.user.email || "") as string;
  const userEmail = (session.user.email || "") as string;

  try {
    const files = await getUserFiles(userId, userEmail);
    
    let cv = null;
    let portfolio = null;

    for (const f of files) {
      if (f.file_type === "cv" && !cv) {
        cv = {
          id: f.id,
          fileName: f.file_name,
          fileUrl: f.file_url,
          fileSize: f.file_size,
          mimeType: f.mime_type,
          createdAt: f.created_at,
        };
      } else if (f.file_type === "portfolio" && !portfolio) {
        portfolio = {
          id: f.id,
          fileName: f.file_name,
          fileUrl: f.file_url,
          fileSize: f.file_size,
          mimeType: f.mime_type,
          createdAt: f.created_at,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: { cv, portfolio },
    });
  } catch (error) {
    console.error("Get user files error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const fileType = searchParams.get("type") as "cv" | "portfolio";

    if (!fileType || !["cv", "portfolio"].includes(fileType)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    const userId = (session.user.id || session.user.email || "") as string;
    const userEmail = (session.user.email || "") as string;

    const existingFile = await getUserFile(userId, fileType, userEmail);
    if (existingFile) {
      // Delete from S3 if possible
      try {
        await deleteFileFromS3Url(existingFile.file_url);
      } catch (s3Err) {
        console.warn("[Delete] S3 deletion error:", s3Err);
      }

      // Delete from PostgreSQL
      await deleteUserFile(userId, fileType, userEmail);
      console.log(`[UserFiles] Deleted ${fileType} for user ${userId} (${userEmail})`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
