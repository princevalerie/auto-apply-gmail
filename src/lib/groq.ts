// Groq AI integration via REST API (OpenAI-compatible format)
// Used as fallback when Gemini hits rate limits

import type { JobInfo, GeneratedEmail, FileAttachment } from "./gemini";
import { discoverModels, getPreferredGroqVisionModel, getPreferredGroqTextModel } from "./model-discovery";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string | GroqContentPart[];
}

interface GroqContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  jsonMode: boolean = false
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 4096,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMsg =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `Groq API error: ${res.status}`;
    throw new Error(errorMsg);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content;
}

// ─── Extract Job Info from Screenshot (Vision) ──────────────

export async function extractJobInfoGroq(
  apiKey: string,
  imageBase64: string,
  mimeType: string
): Promise<JobInfo> {
  const imageUrl = `data:${mimeType};base64,${imageBase64}`;

  const messages: GroqMessage[] = [
    {
      role: "system",
      content: `Kamu adalah asisten yang menganalisis screenshot lowongan kerja. Selalu respond dalam format JSON yang valid dengan struktur:
{
  "position": "string",
  "company": "string",
  "email": "string (kosongkan jika tidak ditemukan)",
  "requirements": ["string array"],
  "location": "string (kosongkan jika tidak ditemukan)",
  "subjectInstruction": "string (kosongkan jika tidak ada arahan spesifik)"
}`,
    },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: imageUrl },
        },
        {
          type: "text",
          text: `Analisis screenshot lowongan kerja ini. Ekstrak informasi berikut dalam bahasa asli yang digunakan di lowongan:
1. Nama posisi/role
2. Nama perusahaan
3. Alamat email tujuan (HR/recruiter) — jika tidak ada, kosongkan
4. Requirement/kualifikasi utama (dalam bentuk array)
5. Lokasi kerja — jika tidak ada, kosongkan
6. Instruksi format subject email — perhatikan baik-baik apakah di screenshot ada petunjuk/arahan tentang format subject email yang harus dipakai saat melamar. Jika ada, salin persis arahannya. Jika tidak ada arahan spesifik, kosongkan.

Penting: Pastikan email yang diekstrak benar-benar valid dan ada di screenshot. Jangan mengarang email.

Respond HANYA dalam format JSON yang valid.`,
        },
      ],
    },
  ];

  const discovered = await discoverModels(undefined, apiKey);
  const modelName = getPreferredGroqVisionModel(discovered.groq);
  console.log(`[Groq] Using model for extraction: ${modelName}`);

  const responseText = await callGroq(apiKey, modelName, messages, true);
  return JSON.parse(responseText) as JobInfo;
}

// ─── Generate Email Content ────────────────────────────────

export async function generateEmailGroq(
  apiKey: string,
  jobInfo: JobInfo,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null
): Promise<GeneratedEmail> {
  const requirementsList =
    jobInfo.requirements.length > 0
      ? `Requirements yang diminta: ${jobInfo.requirements.join(", ")}`
      : "Tidak ada requirement spesifik yang terdeteksi.";

  const locationInfo = jobInfo.location ? `Lokasi: ${jobInfo.location}` : "";

  const subjectRule = jobInfo.subjectInstruction
    ? `- WAJIB ikuti arahan format subject dari lowongan: "${jobInfo.subjectInstruction}". Ganti bagian nama pelamar dengan nama asli dari CV. Isi bagian posisi/role sesuai data yang terdeteksi.`
    : `- Buat subject yang profesional dan mencantumkan posisi yang dilamar. Gunakan nama asli pelamar dari CV (JANGAN pakai placeholder).`;

  // Determine time of day for greeting (WIB)
  const currentHour = parseInt(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Jakarta",
      hour: "numeric",
      hour12: false,
    }),
    10
  );
  let timeGreeting = "pagi";
  if (currentHour >= 11 && currentHour < 15) timeGreeting = "siang";
  else if (currentHour >= 15 && currentHour < 18) timeGreeting = "sore";
  else if (currentHour >= 18 || currentHour < 3) timeGreeting = "malam";

  // Build content parts for Groq
  const parts: GroqContentPart[] = [];

  // Attach CV as image if available (Groq can read PDF pages as images, but for text-based model we include as text instruction)
  // Note: Groq text model doesn't support file attachments directly, so we instruct based on available info
  if (cvFile) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${cvFile.mimeType};base64,${cvFile.base64}` },
    });
  }

  if (portfolioFile) {
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${portfolioFile.mimeType};base64,${portfolioFile.base64}`,
      },
    });
  }

  parts.push({
    type: "text",
    text: `Buatkan email lamaran kerja profesional dalam Bahasa Indonesia formal untuk posisi berikut:

Posisi: ${jobInfo.position}
Perusahaan: ${jobInfo.company}
${locationInfo}
${requirementsList}

${cvFile ? "File CV pelamar terlampir di atas — baca dan gunakan informasi dari CV (nama lengkap, skill, pengalaman, pendidikan) untuk mempersonalisasi email." : ""}
${portfolioFile ? "File portfolio pelamar juga terlampir — gunakan informasi proyek/karya di dalamnya jika relevan." : ""}

Aturan KETAT:
- DILARANG menggunakan placeholder seperti [NAMA_ANDA], [Nama Anda], [NAMA], atau sejenisnya. Semua informasi HARUS terisi dengan data asli.
${cvFile ? "- Ambil nama lengkap pelamar dari CV yang terlampir. Gunakan nama asli tersebut di subject dan body email." : "- Jika tidak ada CV, gunakan nama 'Pelamar' sebagai fallback."}
- Subject email:
  ${subjectRule}

PANDUAN TONE & GAYA PENULISAN (SANGAT PENTING):
- Tulis email dengan tone PERCAYA DIRI dan TENANG — bukan desperate/memohon.
- DILARANG KERAS menggunakan kata/frasa berikut:
  * "sangat tertarik" / "sangat berminat" / "sangat antusias"
  * "sangat berharap" / "besar harapan saya"
  * "saya mahir" / "saya menguasai" / "saya ahli"
  * "sangat siap" / "siap berkomitmen penuh"
  * kata "sangat" secara umum — hindari sebisa mungkin
- JANGAN self-claim kemampuan. Alih-alih bilang "saya mahir Python", cukup sebutkan fakta pengalaman.
- Sebutkan pengalaman/proyek secara FAKTUAL dan singkat, biarkan pembaca yang menilai.
- Cantumkan informasi kontak (Nomor HP dan Email) pelamar yang ditemukan di CV pada bagian bawah body email.
- Jangan terlalu menjual diri. Cukup sampaikan fakta relevan dengan ringkas.

STRUKTUR BODY EMAIL:
- Salam pembuka langsung (WAJIB gunakan: "Selamat ${timeGreeting},")
- Paragraf 1: Perkenalan singkat + tujuan melamar. Cukup 1-2 kalimat.
- Paragraf 2: Sebutkan 1-2 pengalaman/proyek yang PALING RELEVAN. Cukup 2-3 kalimat.
- Paragraf 3: Kalimat penutup singkat — sebutkan ${portfolioFile ? "CV dan portfolio" : "CV"} terlampir, ucapkan terima kasih. Cukup 1-2 kalimat.
- Salam penutup + nama asli pelamar.
- TOTAL body email MAKSIMAL 6-8 kalimat.
- Jangan tambahkan header "Kepada Yth." atau alamat — langsung mulai dari salam pembuka.

Respond HANYA dalam format JSON: {"subject": "...", "body": "..."}`,
  });

  const messages: GroqMessage[] = [
    {
      role: "system",
      content:
        'Kamu adalah asisten profesional yang membantu membuat email lamaran kerja. Selalu respond dalam format JSON yang valid dengan struktur: {"subject": "string", "body": "string"}',
    },
    {
      role: "user",
      content: parts,
    },
  ];

  const discovered = await discoverModels(undefined, apiKey);
  const visionModel = getPreferredGroqVisionModel(discovered.groq);
  const textModel = getPreferredGroqTextModel(discovered.groq);
  const model = cvFile || portfolioFile ? visionModel : textModel;
  console.log(`[Groq] Using model for email: ${model}`);

  const responseText = await callGroq(apiKey, model, messages, true);
  return JSON.parse(responseText) as GeneratedEmail;
}
