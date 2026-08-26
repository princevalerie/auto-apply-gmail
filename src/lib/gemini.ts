import { GoogleGenerativeAI, SchemaType, ResponseSchema } from "@google/generative-ai";
import { discoverModels, getPreferredGeminiModels } from "./model-discovery";

function getGenAI(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini API key tidak tersedia. Set GEMINI_API_KEY di environment atau masukkan via Settings.");
  }
  return new GoogleGenerativeAI(key);
}

// Error handler removed - we now retry on ANY error

// ─── Types ─────────────────────────────────────────────────

export interface JobInfo {
  position: string;
  company: string;
  email: string;
  requirements: string[];
  location: string;
  subjectInstruction: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export interface ExtractedJobAndEmail {
  position: string;
  company: string;
  email: string;
  requirements: string[];
  location: string;
  subjectInstruction: string;
  emailSubject: string;
  emailBody: string;
}

export interface FileAttachment {
  base64: string;
  mimeType: string;
}

// ─── Extract Job Info from Screenshot ──────────────────────

export async function extractJobInfo(
  imageBase64: string,
  mimeType: string,
  apiKey?: string
): Promise<JobInfo> {
  const genAI = getGenAI(apiKey);

  const jobInfoSchema: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      position: {
        type: SchemaType.STRING,
        description: "Nama posisi/role yang dilamar",
      },
      company: {
        type: SchemaType.STRING,
        description: "Nama perusahaan yang membuka lowongan",
      },
      email: {
        type: SchemaType.STRING,
        description:
          "Alamat email tujuan (HR/recruiter). Kosongkan string jika tidak ditemukan.",
      },
      requirements: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Daftar requirement/kualifikasi utama",
      },
      location: {
        type: SchemaType.STRING,
        description:
          "Lokasi kerja (kota/daerah). Kosongkan string jika tidak ditemukan.",
      },
      subjectInstruction: {
        type: SchemaType.STRING,
        description:
          "Instruksi/arahan format subject email yang diminta di lowongan (misal: 'Subject: Lamaran_NamaPosisi_Nama'). Kosongkan string jika tidak ada arahan spesifik di screenshot.",
      },
    },
    required: ["position", "company", "email", "requirements", "location", "subjectInstruction"],
  };

  let lastError: Error | null = null;

  // Auto-discover available models
  const discovered = await discoverModels(apiKey);
  const modelsToTry = getPreferredGeminiModels(discovered.gemini);
  console.log(`[Gemini] Will try models: ${modelsToTry.join(", ")}`);

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType,
                },
              },
              {
                text: `Analisis screenshot lowongan kerja ini. Ekstrak informasi berikut dalam bahasa asli yang digunakan di lowongan:
1. Nama posisi/role
2. Nama perusahaan
3. Alamat email tujuan (HR/recruiter) — jika tidak ada, kosongkan
4. Requirement/kualifikasi utama (dalam bentuk array)
5. Lokasi kerja — jika tidak ada, kosongkan
6. Instruksi format subject email — perhatikan baik-baik apakah di screenshot ada petunjuk/arahan tentang format subject email yang harus dipakai saat melamar (contoh: "Subject: Lamaran_NamaPosisi_Nama", "Kirim dengan subject: ...", dll). Jika ada, salin persis arahannya. Jika tidak ada arahan spesifik, kosongkan.

Penting: Pastikan email yang diekstrak benar-benar valid dan ada di screenshot. Jangan mengarang email.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jobInfoSchema,
        },
      });

      const responseText = result.response.text();
      return JSON.parse(responseText) as JobInfo;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Gemini] Model ${modelName} failed: ${lastError.message}`);
      // Continue to next model on ANY error (404, 429, 500, etc)
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

// ─── Generate Email Content ────────────────────────────────

export async function generateEmail(
  jobInfo: JobInfo,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null,
  apiKey?: string
): Promise<GeneratedEmail> {
  const genAI = getGenAI(apiKey);

  const emailSchema: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      subject: {
        type: SchemaType.STRING,
        description: "Subject email lamaran kerja (sudah terisi lengkap, tanpa placeholder)",
      },
      body: {
        type: SchemaType.STRING,
        description: "Isi/body email lamaran kerja (sudah terisi lengkap, tanpa placeholder)",
      },
    },
    required: ["subject", "body"],
  };

  const requirementsList = jobInfo.requirements.length > 0
    ? `Requirements yang diminta: ${jobInfo.requirements.join(", ")}`
    : "Tidak ada requirement spesifik yang terdeteksi.";

  const locationInfo = jobInfo.location
    ? `Lokasi: ${jobInfo.location}`
    : "";

  const subjectRule = jobInfo.subjectInstruction
    ? `- WAJIB ikuti arahan format subject dari lowongan: "${jobInfo.subjectInstruction}". Ganti bagian nama pelamar dengan nama asli dari CV. Isi bagian posisi/role sesuai data yang terdeteksi.`
    : `- Buat subject yang profesional dan mencantumkan posisi yang dilamar. Gunakan nama asli pelamar dari CV (JANGAN pakai placeholder).`;

  // Determine time of day for greeting (WIB)
  const currentHour = parseInt(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }),
    10
  );
  let timeGreeting = "pagi";
  if (currentHour >= 11 && currentHour < 15) timeGreeting = "siang";
  else if (currentHour >= 15 && currentHour < 18) timeGreeting = "sore";
  else if (currentHour >= 18 || currentHour < 3) timeGreeting = "malam";

  // Build content parts — always include text prompt
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Attach CV file if available (Gemini can read PDFs)
  if (cvFile) {
    parts.push({
      inlineData: {
        data: cvFile.base64,
        mimeType: cvFile.mimeType,
      },
    });
  }

  // Attach portfolio file if available
  if (portfolioFile) {
    parts.push({
      inlineData: {
        data: portfolioFile.base64,
        mimeType: portfolioFile.mimeType,
      },
    });
  }

  const companyTarget = jobInfo.company && jobInfo.company !== "N/A"
    ? `Yth. Tim Rekrutmen ${jobInfo.company},`
    : "Yth. Bapak/Ibu Tim Rekrutmen,";

  // Main prompt
  parts.push({
    text: `Buatkan email lamaran kerja profesional, sopan, dan beretika dalam Bahasa Indonesia formal untuk posisi berikut:

Posisi: ${jobInfo.position}
Perusahaan: ${jobInfo.company}
${locationInfo}
${requirementsList}

${cvFile ? "File CV pelamar terlampir di atas — baca dan gunakan informasi dari CV (nama lengkap, skill, pengalaman, pendidikan, kontak) untuk mempersonalisasi email." : ""}
${portfolioFile ? "File portfolio pelamar juga terlampir — gunakan informasi proyek/karya di dalamnya jika relevan." : ""}

STATUS & PROFIL PELAMAR (WAJIB DISEBUTKAN DENGAN JELAS):
- Pelamar adalah mahasiswa tingkat akhir (final-year student) yang menjalankan perkuliahan secara online/daring tanpa ada jadwal kelas tatap muka/offline aktif.
- Jelaskan bahwa pelamar memiliki ketersediaan waktu penuh (full-time availability) dan fleksibilitas tinggi untuk bekerja secara optimal.

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
   Mulai dengan gaya mengalir sopan dan sebutkan status mahasiswa tingkat akhir dengan perkuliahan online / tanpa kelas offline aktif sehingga memiliki full-time availability. Contoh: "Perkenalkan, saya [Nama Lengkap Asli], mahasiswa tingkat akhir [Jurusan & Universitas dari CV] yang saat ini menjalankan perkuliahan secara daring (online) tanpa kewajiban kelas tatap muka (offline), sehingga memiliki ketersediaan waktu penuh. Melalui email ini, saya bermaksud mengajukan lamaran untuk posisi ${jobInfo.position} di ${jobInfo.company}." (Cukup 1-2 kalimat).
4. Paragraf 2 (Kualifikasi & Pengalaman Relevan):
   Sebutkan 1-2 pengalaman/proyek/alat kerja yang PALING RELEVAN secara faktual berdasarkan CV. Cukup 2-3 kalimat.
5. Paragraf 3 (Lampiran & Ucapan Terima Kasih):
   "Sebagai bahan pertimbangan, bersama email ini saya lampirkan ${portfolioFile ? "CV dan portofolio" : "CV"} saya. Terima kasih atas waktu dan kesempatan yang Bapak/Ibu berikan." (Cukup 1-2 kalimat).
6. Tanda Tangan & Kontak Rapi:
   Hormat saya,
   [Nama Lengkap Asli Pelamar]
   [Nomor HP/WhatsApp berformat rapi, contoh: +62 812-xxxx-xxxx] | [Email Pelamar]

TOTAL body email: 6-8 kalimat. Ringkas, sopan, dan berbobot.`,
  });

  let lastError: Error | null = null;

  // Auto-discover available models
  const discovered = await discoverModels(apiKey);
  const modelsToTry = getPreferredGeminiModels(discovered.gemini);
  console.log(`[Gemini] Will try models for email: ${modelsToTry.join(", ")}`);

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Trying model for email: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: emailSchema,
        },
      });

      const responseText = result.response.text();
      return JSON.parse(responseText) as GeneratedEmail;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Gemini] Model ${modelName} failed for email: ${lastError.message}`);
      // Continue to next model on ANY error
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

// ─── Combined Extract & Generate Email in 1 Single AI Call ───

export async function extractAndGenerateGemini(
  imageBase64: string,
  mimeType: string,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null,
  apiKey?: string,
  language: "id" | "en" = "id",
  overrideModel?: string
): Promise<ExtractedJobAndEmail> {
  const genAI = getGenAI(apiKey);

  const combinedSchema: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      position: {
        type: SchemaType.STRING,
        description: "Nama posisi/role yang dilamar dari screenshot",
      },
      company: {
        type: SchemaType.STRING,
        description: "Nama perusahaan yang membuka lowongan dari screenshot",
      },
      email: {
        type: SchemaType.STRING,
        description: "Alamat email tujuan recruiter dari screenshot (kosongkan jika tidak ada)",
      },
      requirements: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "Daftar requirement/kualifikasi utama dari screenshot",
      },
      location: {
        type: SchemaType.STRING,
        description: "Lokasi kerja dari screenshot (kosongkan jika tidak ada)",
      },
      subjectInstruction: {
        type: SchemaType.STRING,
        description: "Instruksi format subject email dari screenshot (kosongkan jika tidak ada arahan spesifik)",
      },
      emailSubject: {
        type: SchemaType.STRING,
        description: "Subject email lamaran kerja yang sudah terisi lengkap (nama asli pelamar dari CV, posisi yang dilamar, tanpa placeholder)",
      },
      emailBody: {
        type: SchemaType.STRING,
        description: "Isi/body email lamaran kerja yang sudah terisi lengkap dan dipisahkan dengan newline ganda (\\n\\n) agar rapi",
      },
    },
    required: [
      "position",
      "company",
      "email",
      "requirements",
      "location",
      "subjectInstruction",
      "emailSubject",
      "emailBody",
    ],
  };

  // Build content parts
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    },
  ];

  if (cvFile) {
    parts.push({
      inlineData: {
        data: cvFile.base64,
        mimeType: cvFile.mimeType,
      },
    });
  }

  if (portfolioFile) {
    parts.push({
      inlineData: {
        data: portfolioFile.base64,
        mimeType: portfolioFile.mimeType,
      },
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
   - APPLICANT PROFILE: Final-year student currently completing online-only coursework with no mandatory offline/on-campus classes (providing full-time availability).
   - Real contact data: Extract applicant's full name, WhatsApp/phone number, and email from the attached CV.
   - NO PLACEHOLDERS ([NAME], [Company], etc). Everything must be populated with real data.

MANDATORY EMAIL BODY STRUCTURE (Every block MUST be separated by a double line break \\n\\n):

Dear Hiring Team at [Company Name],

Good day,

My name is [Full Name from CV], a final-year Informatics Engineering student currently conducting my studies online with no mandatory on-campus classes, giving me full-time availability. I am writing to apply for the [Position] position at [Company].

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
   - PROFIL PELAMAR: Mahasiswa tingkat akhir Teknik Informatika yang saat ini menjalankan perkuliahan secara daring (online) tanpa kewajiban kelas tatap muka (offline), sehingga memiliki ketersediaan waktu penuh (full-time availability) untuk bekerja.
   - Ambil nama lengkap asli pelamar, nomor WhatsApp/HP, dan email langsung dari file CV terlampir.
   - DILARANG MENGGUNAKAN PLACEHOLDER apapun ([NAMA], [Perusahaan], dll).

STRUKTUR WAJIB ISI EMAIL (Setiap bagian WAJIB dipisahkan dengan double line break \n\n):

Kepada Tim Rekrutmen [Nama Perusahaan],

Selamat pagi/siang Bapak/Ibu,

Perkenalkan, saya [Nama Lengkap Asli Pelamar dari CV], mahasiswa tingkat akhir Teknik Informatika yang saat ini menjalankan perkuliahan secara daring (online) tanpa ada kewajiban kelas tatap muka (offline), sehingga memiliki ketersediaan waktu penuh untuk bekerja secara optimal. Melalui email ini, saya bermaksud mengajukan lamaran untuk posisi [Posisi] di [Perusahaan].

[1-2 kalimat fakta relevan yang mencocokkan keahlian dan pengalaman pelamar dari CV dengan kebutuhan posisi di screenshot, misalnya pengolahan data menggunakan SQL, Looker Studio, Power BI, Python, Excel, dsb].

Sebagai bahan pertimbangan, bersama email ini saya lampirkan CV ${portfolioFile ? "dan portofolio " : ""}saya yang memuat rincian pengalaman serta proyek yang pernah saya kerjakan. Terima kasih atas waktu dan perhatian Bapak/Ibu.

Hormat saya,
[Nama Lengkap Asli Pelamar dari CV]
WhatsApp: [Nomor WhatsApp/HP dari CV, contoh: +62 8xx-xxxx-xxxx]
[Email Pelamar dari CV]`;

  parts.push({ text: promptText });

  let lastError: Error | null = null;
  let modelsToTry: string[];

  if (overrideModel) {
    console.log(`[Gemini] Using user-selected model: ${overrideModel}`);
    modelsToTry = [overrideModel];
  } else {
    const discovered = await discoverModels(apiKey);
    modelsToTry = getPreferredGeminiModels(discovered.gemini);
  }

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Trying single-call model (${language}): ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: combinedSchema,
        },
      });

      const responseText = result.response.text();
      return JSON.parse(responseText) as ExtractedJobAndEmail;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Gemini] Single-call model ${modelName} failed: ${lastError.message}`);
    }
  }

  throw lastError || new Error("All Gemini models failed in single-call");
}
