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
