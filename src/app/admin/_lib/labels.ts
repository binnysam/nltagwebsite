import type { ContactStatus, PhotoPermission, PrayerStatus, TestimonySubmissionStatus } from "@/server/db/schema";

/** Admin (English) labels for the inbox and gallery states. */
export const PRAYER_STATUS_LABEL: Record<PrayerStatus, string> = { NEW: "New", READ: "Read", PRAYED: "Prayed for", ARCHIVED: "Archived" };
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = { NEW: "New", REPLIED: "Replied", ARCHIVED: "Archived" };
export const SUBMISSION_STATUS_LABEL: Record<TestimonySubmissionStatus, string> = { NEW: "New", ACCEPTED: "Accepted as draft", REJECTED: "Not accepted", ARCHIVED: "Archived" };
export const DISPLAY_LABEL = { FULL_NAME: "Full name", FIRST_NAME: "First name only", ANONYMOUS: "Anonymous" } as const;
export const PHOTO_PERMISSION_LABEL: Record<PhotoPermission, string> = { NOT_RECORDED: "Not recorded", GRANTED: "Granted", WITHDRAWN: "Withdrawn" };
