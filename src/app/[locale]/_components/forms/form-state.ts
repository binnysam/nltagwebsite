// Shared state for the public forms (prayer, contact, testimony). No server-only imports: used by
// the client form components and the server actions alike.
export type FormStatus = "idle" | "received" | "invalid" | "busy" | "expired" | "unavailable" | "failed";

export interface PublicFormState {
  status: FormStatus;
  /** field → ui-strings key of the error message */
  errors: Record<string, string>;
  /** What the visitor typed, sent back so nothing is lost when a field needs correcting. */
  values: Record<string, string>;
  /** A fresh signed token after each attempt (the form can be sent again). */
  token: string;
  seq: number;
}

export const initialFormState = (token: string): PublicFormState => ({ status: "idle", errors: {}, values: {}, token, seq: 0 });
