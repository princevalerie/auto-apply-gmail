// Groq AI integration via REST API (OpenAI-compatible format)
// Used as fallback when Gemini hits rate limits

import type { JobInfo, GeneratedEmail, FileAttachment, ExtractedJobAndEmail } from "./gemini";
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

  const companyTarget = jobInfo.company && jobInfo.company !== "N/A"
    ? `Yth. Tim Rekrutmen ${jobInfo.company},`
    : "Yth. Bapak/Ibu Tim Rekrutmen,";

  parts.push({
    type: "text",
    text: `Buatkan email lamaran kerja profesional, sopan, dan beretika dalam Bahasa Indonesia formal untuk posisi berikut:

Posisi: ${jobInfo.position}
Perusahaan: ${jobInfo.company}
${locationInfo}
${requirementsList}

${cvFile ? "File CV pelamar terlampir di atas — baca dan gunakan informasi dari CV (nama lengkap, skill, pengalaman, pendidikan, kontak) untuk mempersonalisasi email." : ""}
${portfolioFile ? "File portfolio pelamar juga terlampir — gunakan informasi proyek/karya di dalamnya jika relevan." : ""}

STATUS & PROFIL PELAMAR (WAJIB DISEBUTKAN DENGAN JELAS):
- Pelamar adalah mahasiswa tingkat akhir (final year student) yang SUDAH TIDAK ADA KELAS / tidak menghadiri perkuliahan tatap muka lagi (no class attended / sudah menyelesaikan seluruh mata kuliah perkuliahan & bebas teori / hanya tinggal tugas akhir).
- Jelaskan bahwa pelamar memiliki ketersediaan waktu penuh (full availability) dan fleksibilitas untuk bekerja secara optimal tanpa terhalang jadwal perkuliahan.

Aturan KETAT:
- DILARANG menggunakan placeholder seperti [NAMA_ANDA], [Nama Anda], [NAMA], atau sejenisnya. Semua informasi HARUS terisi dengan data asli dari CV.
${cvFile ? "- Ambil nama lengkap pelamar dari CV yang terlampir. Gunakan nama asli tersebut di subject dan body email." : "- Jika tidak ada CV, gunakan nama 'Pelamar' sebagai fallback."}
- Subject email:
  ${subjectRule}

PANDUAN TONE & GAYA PENULISAN (SANGAT PENTING):
- Tulis email dengan tone SOPAN, PROFESIONAL, PERCAYA DIRI, dan TENANG — bukan robotik dan bukan desperate/memohon.
- DILARANG KERAS menggunakan kata/frasa klise:
  * "sangat tertarik" / "sangat berminat" / "sangat antusias"
  * "sangat berharap" / "besar harapan saya"
  * "saya mahir" / "saya menguasai" / "saya ahli"
  * "sangat siap" / "siap berkomitmen penuh"
  * kata "sangat" secara umum — hindari sebisa mungkin
- JANGAN self-claim kemampuan. Sebutkan fakta pengalaman dan portofolio secara FAKTUAL dan singkat.
- Jangan terlalu menjual diri. Cukup sampaikan fakta relevan dengan ringkas dan elegan.

STRUKTUR BODY EMAIL (WAJIB IKUTI FORMAT INI):
1. Baris Sapaan Penerima: "${companyTarget}"
2. Baris Salam Pembuka: "Selamat pagi/siang Bapak/Ibu," (atau "Dengan hormat,")
3. Paragraf 1 (Perkenalan Luwes & Maksud):
   Mulai dengan gaya mengalir sopan dan sebutkan status mahasiswa tingkat akhir yang sudah tidak ada kelas perkuliahan aktif / full availability. Contoh: "Perkenalkan, saya [Nama Lengkap Asli], mahasiswa tingkat akhir [Jurusan & Universitas dari CV] yang telah menyelesaikan seluruh mata kuliah perkuliahan tanpa ada kelas tatap muka yang perlu dihadiri, sehingga memiliki ketersediaan waktu penuh. Melalui email ini, saya bermaksud mengajukan lamaran untuk posisi ${jobInfo.position} di ${jobInfo.company}." (Cukup 1-2 kalimat).
4. Paragraf 2 (Kualifikasi & Pengalaman Relevan):
   Sebutkan 1-2 pengalaman/proyek/alat kerja yang PALING RELEVAN secara faktual berdasarkan CV. Cukup 2-3 kalimat.
5. Paragraf 3 (Lampiran & Ucapan Terima Kasih):
   "Sebagai bahan pertimbangan, bersama email ini saya lampirkan ${portfolioFile ? "CV dan portofolio" : "CV"} saya. Terima kasih atas waktu dan kesempatan yang Bapak/Ibu berikan." (Cukup 1-2 kalimat).
6. Tanda Tangan & Kontak Rapi:
   Hormat saya,
   [Nama Lengkap Asli Pelamar]
   [Nomor HP/WhatsApp berformat rapi, contoh: +62 812-xxxx-xxxx] | [Email Pelamar]

TOTAL body email: 6-8 kalimat. Ringkas, sopan, dan berbobot.

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

// ─── Combined Extract & Generate Email in 1 Single AI Call (Groq) ───

export async function extractAndGenerateGroq(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null,
  language: "id" | "en" = "id"
): Promise<ExtractedJobAndEmail> {
  const parts: GroqContentPart[] = [
    {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    },
  ];

  if (cvFile) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${cvFile.mimeType};base64,${cvFile.base64}` },
    });
  }

  if (portfolioFile) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${portfolioFile.mimeType};base64,${portfolioFile.base64}` },
    });
  }

  const promptText = language === "en"
    ? `Task:
1. Analyze the job vacancy screenshot (first image) and extract:
   - position: job title
   - company: company name
   - email: recruiter/HR target email (empty string if not found)
   - requirements: array of key requirements
   - location: work location (empty string if not found)
   - subjectInstruction: subject format instructions from screenshot if any

2. Write a HIGH-QUALITY, CONFIDENT, AND ELEGANT job application email in standard professional business English:
   - MATCHMAKING LOGIC: Carefully cross-reference the job requirements from the screenshot (e.g. tools, skills, tasks) with the applicant's actual experiences and projects in the attached CV. Specifically highlight 1-2 concrete qualifications that demonstrate why the applicant is a great fit for this exact role.
   - TONE & STYLE: Calm, confident, polite, and articulate.
   - FORBIDDEN PHRASES: NEVER use desperate or cliché wording like "available anytime", "greatly looking forward", "I really hope", "pleading for opportunity", etc.
   - APPLICANT MAJOR: "Informatics Engineering" or "Computer Science" (DO NOT write Electronics).
   - APPLICANT PROFILE: Final-year student who has completed all coursework with no on-campus classes remaining (full-time availability).
   - Real contact data: Extract applicant's full name, WhatsApp/phone number, and email from the attached CV.
   - NO PLACEHOLDERS ([NAME], [Company], etc). Everything must be populated with real data.

MANDATORY EMAIL BODY STRUCTURE (Every block MUST be separated by a double line break \\n\\n):

Dear Hiring Team at [Company Name],

Good day,

My name is [Full Name from CV], a final-year Informatics Engineering student who has completed all coursework with no remaining on-campus classes, giving me full-time availability. I am writing to apply for the [Position] position at [Company].

[1-2 crisp, professional sentences connecting the applicant's specific skills/experiences from the CV directly to the requirements listed in the vacancy, such as data analysis, SQL, Power BI, Python, Excel, etc.].

Attached is my resume ${portfolioFile ? "and portfolio " : ""}for your review. Thank you for your time and consideration.

Sincerely,
[Full Name from CV]
WhatsApp: [WhatsApp/Phone number from CV]
[Email from CV]`
    : `Tugasmu:
1. Analisis screenshot lowongan kerja (gambar pertama) dan ekstrak:
   - position: nama posisi/role yang dilamar
   - company: nama perusahaan yang membuka lowongan
   - email: alamat email HR/recruiter tujuan (kosongkan string jika tidak ada)
   - requirements: array requirement/kualifikasi utama
   - location: lokasi kerja (kosongkan jika tidak ada)
   - subjectInstruction: arahan format subject jika tertulis di screenshot

2. Buatkan email lamaran kerja yang SANGAT BERBOBOT, SOPAN, PERCAYA DIRI, dan RAPI dalam Bahasa Indonesia formal:
   - PENCOCOKAN KUALIFIKASI (SANGAT PENTING): Cocokkan requirement dari screenshot (misal: Excel, SQL, analisis data, reporting, visualisasi data, dll) dengan pengalaman, proyek, dan keahlian yang ada di CV pelamar. Jelaskan secara FAKTUAL dan relevan dalam 1-2 kalimat mengapa kualifikasi pelamar tepat untuk posisi ini.
   - PANDUAN TONE: Tenang, beretika, profesional, dan meyakinkan.
   - DILARANG KERAS menggunakan kata-kata desperate / murahan / klise seperti:
     * "siap dihubungi kapan saja" / "kapan pun"
     * "sangat tertarik" / "sangat berminat" / "sangat berharap"
     * "besar harapan saya" / "mohon diberi kesempatan"
   - JURUSAN PELAMAR: "Teknik Informatika" (DILARANG KERAS menulis "Informatika Elektronika" atau kata "Elektronika").
   - PROFIL PELAMAR: Mahasiswa tingkat akhir Teknik Informatika yang telah menyelesaikan seluruh mata kuliah perkuliahan tanpa kelas tatap muka aktif (bebas teori), sehingga memiliki ketersediaan waktu penuh (full-time availability) untuk bekerja.
   - Ambil nama lengkap asli pelamar, nomor WhatsApp/HP, dan email langsung dari file CV terlampir.
   - DILARANG MENGGUNAKAN PLACEHOLDER apapun ([NAMA], [Perusahaan], dll).

STRUKTUR WAJIB ISI EMAIL (Setiap bagian WAJIB dipisahkan dengan double line break \\n\\n):

Kepada Tim Rekrutmen [Nama Perusahaan],

Selamat pagi/siang Bapak/Ibu,

Perkenalkan, saya [Nama Lengkap Asli Pelamar dari CV], mahasiswa tingkat akhir Teknik Informatika yang telah menyelesaikan seluruh mata kuliah perkuliahan tanpa ada kelas tatap muka aktif, sehingga memiliki ketersediaan waktu penuh untuk bekerja secara optimal. Melalui email ini, saya bermaksud mengajukan lamaran untuk posisi [Posisi] di [Perusahaan].

[1-2 kalimat fakta relevan yang mencocokkan keahlian dan pengalaman pelamar dari CV dengan kebutuhan posisi di screenshot, misalnya pengolahan data menggunakan SQL, Looker Studio, Power BI, Python, Excel, dsb].

Sebagai bahan pertimbangan, bersama email ini saya lampirkan CV ${portfolioFile ? "dan portofolio " : ""}saya yang memuat rincian pengalaman serta proyek yang pernah saya kerjakan. Terima kasih atas waktu dan perhatian Bapak/Ibu.

Hormat saya,
[Nama Lengkap Asli Pelamar dari CV]
WhatsApp: [Nomor WhatsApp/HP dari CV, contoh: +62 8xx-xxxx-xxxx]
[Email Pelamar dari CV]`;

  parts.push({
    type: "text",
    text: promptText,
  });

  const messages: GroqMessage[] = [
    {
      role: "system",
      content: `Kamu adalah asisten profesional yang mengekstrak info lowongan dan langsung membuat email lamaran kerja. Selalu respond HANYA dalam format JSON valid dengan struktur:
{
  "position": "string",
  "company": "string",
  "email": "string (kosongkan jika tidak ada)",
  "requirements": ["string"],
  "location": "string (kosongkan jika tidak ada)",
  "subjectInstruction": "string (kosongkan jika tidak ada)",
  "emailSubject": "string",
  "emailBody": "string"
}`,
    },
    {
      role: "user",
      content: parts,
    },
  ];

  const discovered = await discoverModels(undefined, apiKey);
  const visionModel = getPreferredGroqVisionModel(discovered.groq);
  console.log(`[Groq] Using single-call model (${language}): ${visionModel}`);

  const responseText = await callGroq(apiKey, visionModel, messages, true);
  return JSON.parse(responseText) as ExtractedJobAndEmail;
}
