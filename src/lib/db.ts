// Neon PostgreSQL database client
// Uses @neondatabase/serverless for Vercel Edge/Serverless compatibility

import { neon } from "@neondatabase/serverless";

function getSQL() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL tidak tersedia. Set DATABASE_URL di environment.");
  }
  return neon(databaseUrl);
}

export const sql = getSQL();

// ─── Initialize Database Schema ──────────────────────────────

let isSchemaInitialized = false;

export async function initDatabase() {
  if (isSchemaInitialized) return;
  const db = getSQL();

  try {
    // Create users table
    await db`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        image TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create user_files table (stores metadata + S3 URL, NOT binary)
    await db`
      CREATE TABLE IF NOT EXISTS user_files (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('cv', 'portfolio')),
        file_name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT DEFAULT 'application/pdf',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create index for faster file lookups
    await db`
      CREATE INDEX IF NOT EXISTS idx_user_files_user_type 
      ON user_files(user_id, file_type)
    `;

    // Create applications table (job application history)
    await db`
      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position TEXT NOT NULL,
        company TEXT NOT NULL,
        target_email TEXT NOT NULL,
        email_subject TEXT,
        email_body TEXT,
        location TEXT,
        requirements JSONB DEFAULT '[]',
        ai_provider TEXT,
        gmail_message_id TEXT,
        status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'draft')),
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create index for user application history
    await db`
      CREATE INDEX IF NOT EXISTS idx_applications_user 
      ON applications(user_id, sent_at DESC)
    `;

    isSchemaInitialized = true;
    console.log("[DB] Database schema initialized successfully");
  } catch (schemaErr) {
    console.warn("[DB] Schema init warning:", schemaErr);
  }
}

// ─── User Operations ─────────────────────────────────────────

export async function upsertUser(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}) {
  const db = getSQL();

  // If email exists, check if user exists with this email or id to prevent unique constraint conflict
  if (user.email) {
    const existing = await db`
      SELECT id FROM users WHERE email = ${user.email} OR id = ${user.id} LIMIT 1
    `;
    if (existing && existing.length > 0) {
      const targetId = existing[0].id;
      await db`
        UPDATE users
        SET name = COALESCE(${user.name || null}, name),
            email = COALESCE(${user.email || null}, email),
            image = COALESCE(${user.image || null}, image),
            updated_at = NOW()
        WHERE id = ${targetId}
      `;
      return targetId;
    }
  }

  await db`
    INSERT INTO users (id, name, email, image, updated_at)
    VALUES (${user.id}, ${user.name || null}, ${user.email || null}, ${user.image || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, users.name),
      email = COALESCE(EXCLUDED.email, users.email),
      image = COALESCE(EXCLUDED.image, users.image),
      updated_at = NOW()
  `;
  return user.id;
}

// ─── File Operations ─────────────────────────────────────────

/**
 * Resolve the canonical user ID from the database.
 * Looks up by both id and email to handle cases where the auth provider
 * returns different IDs across sessions (e.g., sub vs email).
 */
async function resolveUserId(
  db: ReturnType<typeof getSQL>,
  userId: string,
  userEmail?: string
): Promise<string> {
  if (userEmail) {
    const rows = await db`
      SELECT id FROM users WHERE id = ${userId} OR email = ${userEmail} LIMIT 1
    `;
    if (rows.length > 0) return rows[0].id;
  } else {
    const rows = await db`
      SELECT id FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (rows.length > 0) return rows[0].id;
  }
  return userId;
}

export async function saveFileRecord(params: {
  userId: string;
  userEmail?: string;
  fileType: "cv" | "portfolio";
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const db = getSQL();

  // Step 1: Ensure user exists first to prevent foreign key violations.
  // Use ON CONFLICT on both id and email to handle all edge cases.
  try {
    await db`
      INSERT INTO users (id, email, updated_at)
      VALUES (${params.userId}, ${params.userEmail || null}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, users.email),
        updated_at = NOW()
    `;
  } catch (err) {
    // If insert fails (e.g., email unique conflict with different id),
    // try to update the existing user instead
    console.warn("[DB] Ensure user insert conflict, trying update:", err);
    if (params.userEmail) {
      await db`
        UPDATE users SET updated_at = NOW()
        WHERE id = ${params.userId} OR email = ${params.userEmail}
      `.catch(e => console.warn("[DB] Ensure user fallback update error:", e));
    }
  }

  // Step 2: Resolve the canonical user ID (handles id/email mismatches)
  const canonicalUserId = await resolveUserId(db, params.userId, params.userEmail);

  // Step 3: Delete previous file of same type for this user
  // Fixed: Added proper parentheses around OR condition so AND file_type applies to both
  if (params.userEmail) {
    await db`
      DELETE FROM user_files 
      WHERE (
        user_id = ${canonicalUserId} 
        OR user_id IN (SELECT id FROM users WHERE email = ${params.userEmail})
      )
      AND file_type = ${params.fileType}
    `.catch(err => console.warn("[DB] Delete previous file warning:", err));
  } else {
    await db`
      DELETE FROM user_files 
      WHERE user_id = ${canonicalUserId} AND file_type = ${params.fileType}
    `.catch(err => console.warn("[DB] Delete previous file warning:", err));
  }

  // Step 4: Insert new file record using the canonical user ID
  const result = await db`
    INSERT INTO user_files (user_id, file_type, file_name, file_url, file_size, mime_type)
    VALUES (${canonicalUserId}, ${params.fileType}, ${params.fileName}, ${params.fileUrl}, ${params.fileSize || null}, ${params.mimeType || "application/pdf"})
    RETURNING id, file_url
  `;

  return result[0];
}

export async function getUserFile(userId: string, fileType: "cv" | "portfolio", userEmail?: string) {
  const db = getSQL();

  // Resolve canonical user ID first
  const canonicalUserId = await resolveUserId(db, userId, userEmail);

  if (userEmail) {
    const result = await db`
      SELECT uf.id, uf.file_name, uf.file_url, uf.file_size, uf.mime_type, uf.created_at
      FROM user_files uf
      LEFT JOIN users u ON u.id = uf.user_id
      WHERE (uf.user_id = ${canonicalUserId} OR u.email = ${userEmail})
        AND uf.file_type = ${fileType}
      ORDER BY uf.created_at DESC
      LIMIT 1
    `;
    return result[0] || null;
  }

  const result = await db`
    SELECT id, file_name, file_url, file_size, mime_type, created_at
    FROM user_files
    WHERE user_id = ${canonicalUserId} AND file_type = ${fileType}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result[0] || null;
}

export async function getUserFiles(userId: string, userEmail?: string) {
  const db = getSQL();

  // Resolve canonical user ID first
  const canonicalUserId = await resolveUserId(db, userId, userEmail);

  if (userEmail) {
    const result = await db`
      SELECT uf.id, uf.file_type, uf.file_name, uf.file_url, uf.file_size, uf.mime_type, uf.created_at
      FROM user_files uf
      LEFT JOIN users u ON u.id = uf.user_id
      WHERE (uf.user_id = ${canonicalUserId} OR u.email = ${userEmail})
      ORDER BY uf.file_type, uf.created_at DESC
    `;
    return result;
  }

  const result = await db`
    SELECT id, file_type, file_name, file_url, file_size, mime_type, created_at
    FROM user_files
    WHERE user_id = ${canonicalUserId}
    ORDER BY file_type, created_at DESC
  `;
  return result;
}

export async function deleteUserFile(userId: string, fileType: "cv" | "portfolio", userEmail?: string) {
  const db = getSQL();

  // Resolve canonical user ID first
  const canonicalUserId = await resolveUserId(db, userId, userEmail);

  if (userEmail) {
    await db`
      DELETE FROM user_files 
      WHERE (
        user_id = ${canonicalUserId} 
        OR user_id IN (SELECT id FROM users WHERE email = ${userEmail})
      )
      AND file_type = ${fileType}
    `;
    return;
  }

  await db`
    DELETE FROM user_files 
    WHERE user_id = ${canonicalUserId} AND file_type = ${fileType}
  `;
}

// ─── Application Operations ─────────────────────────────────

export async function saveApplication(params: {
  userId: string;
  position: string;
  company: string;
  targetEmail: string;
  emailSubject?: string;
  emailBody?: string;
  location?: string;
  requirements?: string[];
  aiProvider?: string;
  gmailMessageId?: string;
  status?: "sent" | "failed" | "draft";
}) {
  const db = getSQL();
  const result = await db`
    INSERT INTO applications (
      user_id, position, company, target_email, 
      email_subject, email_body, location, requirements,
      ai_provider, gmail_message_id, status, sent_at
    )
    VALUES (
      ${params.userId}, ${params.position}, ${params.company}, ${params.targetEmail},
      ${params.emailSubject || null}, ${params.emailBody || null}, ${params.location || null}, ${JSON.stringify(params.requirements || [])},
      ${params.aiProvider || null}, ${params.gmailMessageId || null}, ${params.status || "sent"}, NOW()
    )
    RETURNING id
  `;
  return result[0];
}

export async function getUserApplications(userId: string, limit: number = 50) {
  const db = getSQL();
  return db`
    SELECT id, position, company, target_email, email_subject, 
           location, ai_provider, gmail_message_id, status, sent_at
    FROM applications
    WHERE user_id = ${userId}
    ORDER BY sent_at DESC
    LIMIT ${limit}
  `;
}

export async function getApplicationStats(userId: string) {
  const db = getSQL();
  const result = await db`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM applications
    WHERE user_id = ${userId}
  `;
  return result[0];
}
