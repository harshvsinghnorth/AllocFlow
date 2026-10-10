/**
 * Gender-segregated allocation — the single source of truth for which students
 * may occupy which blocks.
 *
 * The campus runs men's and women's blocks:
 *   MALE   : BSH, RTH, VSH
 *   FEMALE : KCH, GARGI, APJ
 *
 * A block's `gender` column decides this, never a hard-coded list of codes, so
 * re-designating a block is a data change rather than a code change. CO_ED is
 * accepted by the domain and admits everyone.
 *
 * Every consumer routes through here: the booking service enforces it, the
 * hostel endpoints report it so the UI can grey out what cannot be booked, and
 * both therefore always agree.
 */
import type { HostelGender, StudentGender } from '../database/schema';

export interface Eligibility {
  /** Whether this student may hold a bed in this block. */
  allowed: boolean;
  /** Why not, phrased for display. Null when allowed. */
  reason: string | null;
}

const ALLOWED: Eligibility = { allowed: true, reason: null };

/** "Men's block" / "Women's block" / "Co-ed block", for labels and messages. */
export function hostelGenderLabel(gender: string): string {
  switch (gender) {
    case 'MALE':
      return "Men's block";
    case 'FEMALE':
      return "Women's block";
    default:
      return 'Co-ed block';
  }
}

/** The residents a block admits, as a noun phrase: "male students". */
function residentNoun(gender: string): string {
  return gender === 'MALE' ? 'male students' : 'female students';
}

/**
 * Decides whether `studentGender` may be allocated into a block of
 * `hostelGender`. `hostelCode` only ever appears in the message.
 */
export function checkHostelEligibility(
  studentGender: string | null | undefined,
  hostelGender: string,
  hostelCode?: string,
): Eligibility {
  if (hostelGender === 'CO_ED') return ALLOWED;

  // An unknown gender cannot be matched against a segregated block. Refusing is
  // the safe direction: the alternative silently places the student somewhere
  // the block does not admit.
  if (!studentGender) {
    return {
      allowed: false,
      reason:
        'This student record has no gender recorded, so it cannot be allocated to a gender-segregated block. Ask the hostel office to complete the profile.',
    };
  }

  if (studentGender === hostelGender) return ALLOWED;

  const block = hostelCode ? `${hostelCode} is` : 'This block is';
  return {
    allowed: false,
    reason: `${block} a ${hostelGenderLabel(hostelGender).toLowerCase()} and admits only ${residentNoun(hostelGender)}.`,
  };
}

/**
 * Viewer-facing eligibility for a block.
 *
 * Staff are always `allowed`: the flag drives *their own* booking affordances,
 * and staff do not book beds for themselves. A warden allocating on a student's
 * behalf is still checked against that student's gender inside the booking
 * transaction, which is the only place the rule is actually enforced.
 */
export function eligibilityForViewer(
  viewer: { role: string; gender?: StudentGender | string | null },
  hostelGender: HostelGender | string,
  hostelCode?: string,
): Eligibility {
  if (viewer.role !== 'STUDENT') return ALLOWED;
  return checkHostelEligibility(viewer.gender, hostelGender, hostelCode);
}
