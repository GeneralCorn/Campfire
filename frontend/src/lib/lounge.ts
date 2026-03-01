import type { DischargeState, LoungeMessage } from "@/types";

export function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function generateLoungeConversation(data: DischargeState): LoungeMessage[] {
  const { medications, restrictions, warning_signs, patient_profile } = data;
  const now = Date.now();
  const t = (offsetMins: number) => now - offsetMins * 60 * 1000;

  const medList = medications.map((m) => `${m.name} ${m.dosage}`).join(" and ");
  const r0 = restrictions[0];
  const r1 = restrictions[1];

  return [
    {
      id: "seed-0",
      agent: "Medication Agent",
      text: `I've reviewed the discharge medications for the ${patient_profile.procedure}. The patient is on ${medList}. Key note: ${medications[0].instructions}`,
      timestamp: t(4),
    },
    {
      id: "seed-1",
      agent: "Recovery Agent",
      text: `Thanks. For ${r0.category}: ${r0.rule}${r0.timeline ? ` (${r0.timeline})` : ""}. I'd suggest timing pain meds 30 minutes before any therapy sessions for better mobility.`,
      timestamp: t(3),
    },
    {
      id: "seed-2",
      agent: "Medication Agent",
      text: `Good call. Also ${r1.category}: ${r1.rule}${r1.strict_prohibitions ? ` Strict prohibitions: ${r1.strict_prohibitions.join(", ")}.` : ""}`,
      timestamp: t(2),
    },
    {
      id: "seed-3",
      agent: "Emergency Agent",
      text: `I've flagged ${warning_signs.length} warning signs to monitor: ${warning_signs.map((w) => w.symptom).join(", ")}. ${warning_signs[0].action}.`,
      timestamp: t(1),
    },
    {
      id: "seed-4",
      agent: "Recovery Agent",
      text: `Overall plan looks solid. Feel free to ask anything here, or visit one of our individual rooms for a private conversation.`,
      timestamp: t(0.5),
    },
  ];
}
