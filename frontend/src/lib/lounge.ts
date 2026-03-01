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

  const medNames = medications.map((m) => `${m.name} ${m.dosage}`).join(", ");
  const narcotic = medications.find((m) => m.domain_flags.includes("narcotic"));
  const anticoag = medications.find((m) => m.domain_flags.includes("dvt_prophylaxis") || m.domain_flags.includes("anticoagulant"));
  const ptRestriction = restrictions.find((r) => r.category === "Physical Therapy");
  const dvtSign = warning_signs.find((w) => /dvt|clot|swelling/i.test(w.implication));
  const peSign = warning_signs.find((w) => /pulmonary|embolism|shortness/i.test(w.implication));

  return [
    {
      id: "seed-0",
      agent: "Medication Agent",
      text: `Discharge chart loaded for ${patient_profile.procedure} (${patient_profile.discharge_date}). Patient is on ${medNames}. ` +
        (anticoag
          ? `${anticoag.name} ${anticoag.dosage} is prescribed for DVT prophylaxis — critical that this is taken daily without gaps.`
          : `Pain management is the primary concern for the first 72 hours.`),
      timestamp: t(7),
    },
    {
      id: "seed-1",
      agent: "Emergency Agent",
      text: `Flagging ${warning_signs.length} warning signs on this chart. ` +
        (dvtSign ? `DVT risk is elevated post-knee-surgery — symptoms to watch: ${dvtSign.symptom}. Action: ${dvtSign.action}. ` : "") +
        (peSign ? `Also monitoring for PE: ${peSign.symptom}.` : ""),
      timestamp: t(6),
    },
    {
      id: "seed-2",
      agent: "Recovery Agent",
      text: ptRestriction
        ? `PT protocol: ${ptRestriction.rule} ` +
          `I'd recommend timing ${narcotic ? narcotic.name : "pain meds"} 30–45 minutes before each therapy session to maximize mobility and comfort during exercises.`
        : `Recovery plan is loaded. Coordinating PT schedule with medication timing for optimal outcomes.`,
      timestamp: t(5),
    },
    {
      id: "seed-3",
      agent: "Medication Agent",
      text: narcotic && anticoag
        ? `One interaction to flag: ${narcotic.name} and ${anticoag.name} can both thin the blood slightly. Not contraindicated, but watch for unusual bruising. ` +
          `Also — ${narcotic.name} strictly no alcohol and no driving. Patient must not miss ${anticoag.name} doses.`
        : `Medication schedule is straightforward. Remind patient to take Ibuprofen with food to protect the stomach lining.`,
      timestamp: t(3),
    },
    {
      id: "seed-4",
      agent: "Recovery Agent",
      text: `Full care plan is in sync. I'll monitor rep counts and ROM progress in PT Studio. ` +
        `Each agent room is available for a private one-on-one conversation — voice or text. ` +
        `Ask us anything, any time.`,
      timestamp: t(1),
    },
  ];
}
