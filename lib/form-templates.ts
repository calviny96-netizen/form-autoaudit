import { createBlock, createEnding, newId, type FormBlock, type FormEnding, type Lang } from "./forms";

export const formTemplates = [
  { key: "blank", name: "Blank form", description: "Start empty and add your own blocks." },
  { key: "lead", name: "Lead capture", description: "Collect a name, phone number, and what the customer needs." },
  { key: "feedback", name: "Customer feedback", description: "Ask for a rating, a recommendation score, and comments." },
  { key: "registration", name: "Event registration", description: "Confirm attendance, with a separate ending for people who cannot come." },
] as const;
export type TemplateKey = (typeof formTemplates)[number]["key"];

export function buildTemplate(key: TemplateKey, lang: Lang, title: string, theme: Record<string, unknown> = {}) {
  const L = (en: string, id: string) => (lang === "id" ? id : en);
  const make = (preset: Parameters<typeof createBlock>[0], changes: Partial<FormBlock>) => ({ ...createBlock(preset, lang), ...changes });
  const options = (labels: string[]) => labels.map((label) => ({ id: newId(), label, goto: "" }));
  const ending = (changes: Partial<FormEnding> = {}) => ({ ...createEnding(lang), ...changes });
  let description = "";
  let blocks: FormBlock[] = [];
  let endings: FormEnding[] = [ending()];
  if (key === "lead") {
    description = L("Tell us a little about what you need and we'll get back to you.", "Ceritakan kebutuhan Anda dan kami akan segera menghubungi Anda.");
    blocks = [
      make("name", {}),
      make("phone", { required: true }),
      make("choice", { title: L("What can we help you with?", "Apa yang bisa kami bantu?"), required: true, options: options(lang === "id" ? ["Konsultasi", "Penawaran harga", "Lainnya"] : ["A consultation", "A price quote", "Something else"]) }),
      make("long_text", { title: L("Anything else we should know?", "Ada hal lain yang perlu kami ketahui?") }),
    ];
    endings = [ending({ icon: "send", message: L("Our team will contact you shortly.", "Tim kami akan segera menghubungi Anda.") })];
  }
  if (key === "feedback") {
    description = L("It takes less than a minute and helps us improve.", "Hanya butuh kurang dari satu menit dan sangat membantu kami.");
    blocks = [
      make("rating", { title: L("How was your overall experience?", "Bagaimana pengalaman Anda secara keseluruhan?"), required: true }),
      make("scale", {}),
      make("multi", { title: L("What did you like most?", "Apa yang paling Anda sukai?"), options: options(lang === "id" ? ["Pelayanan", "Kualitas", "Harga", "Kecepatan"] : ["Service", "Quality", "Price", "Speed"]) }),
      make("long_text", { title: L("What could we do better?", "Apa yang bisa kami tingkatkan?") }),
    ];
    endings = [ending({ icon: "heart", message: L("We appreciate your feedback.", "Kami sangat menghargai masukan Anda.") })];
  }
  if (key === "registration") {
    description = L("Let us know whether you can join us.", "Beri tahu kami apakah Anda bisa hadir.");
    const declined = ending({ icon: "smile", title: L("Thanks for letting us know", "Terima kasih sudah memberi kabar"), message: L("We hope to see you next time.", "Semoga kita bisa bertemu di lain kesempatan.") });
    const attending = make("yes_no", { title: L("Will you attend?", "Apakah Anda akan hadir?"), required: true });
    attending.options[1].goto = declined.id;
    blocks = [
      make("name", {}),
      make("phone", { required: true }),
      attending,
      make("number", { title: L("How many people are coming, including you?", "Berapa orang yang akan datang, termasuk Anda?"), required: true, min: 1, max: 10 }),
      make("long_text", { title: L("Any notes for the organizer?", "Ada catatan untuk panitia?") }),
    ];
    endings = [ending({ icon: "ticket", title: L("You're registered!", "Pendaftaran berhasil!"), message: L("We look forward to seeing you.", "Sampai jumpa di acara.") }), declined];
  }
  return {
    theme,
    settings: { language: lang },
    welcome: { enabled: true, title, description, button: "" },
    blocks,
    endings,
  };
}
