import { HttpError } from './http';

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'Send JSON with Content-Type: application/json');
  }
  const text = await req.text();
  if (text.length > 10_000) throw new HttpError(413, 'Request too large');
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(400, 'Body must be a JSON object');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[0-9+()\-.\s]{7,20}$/;

/** Collects every problem so the app can show all field errors at once. */
export class Validator {
  errors: Record<string, string> = {};
  constructor(private body: Record<string, unknown>) {}

  str(field: string, o: { min?: number; max?: number; required?: boolean } = {}): string {
    const { min = 0, max = 200, required = false } = o;
    const v = this.body[field];
    if (v === undefined || v === null || v === '') {
      if (required) this.errors[field] = 'Required';
      return '';
    }
    if (typeof v !== 'string') { this.errors[field] = 'Must be text'; return ''; }
    const s = v.trim();
    if (required && !s) this.errors[field] = 'Required';
    else if (s.length < min) this.errors[field] = `At least ${min} characters`;
    else if (s.length > max) this.errors[field] = `At most ${max} characters`;
    return s;
  }
  email(field: string, required = true): string {
    const s = this.str(field, { max: 254, required });
    if (s && !EMAIL.test(s)) this.errors[field] = 'Enter a valid email';
    return s.toLowerCase();
  }
  phone(field: string, required = false): string {
    const s = this.str(field, { max: 20, required });
    if (s && !PHONE.test(s)) this.errors[field] = 'Enter a valid phone number';
    return s;
  }
  int(field: string, o: { min: number; max: number; required?: boolean }): number {
    const v = this.body[field];
    if (v === undefined || v === null || v === '') {
      if (o.required) this.errors[field] = 'Required';
      return 0;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < o.min || n > o.max) { this.errors[field] = `Enter a whole number from ${o.min} to ${o.max}`; return 0; }
    return n;
  }
  /** YYYY-MM-DD, today or later. Returns '' when empty. */
  futureDate(field: string): string {
    const s = this.str(field, { max: 10 });
    if (!s) return '';
    const d = new Date(s + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      this.errors[field] = 'Use the format YYYY-MM-DD';
    } else if (s < new Date().toISOString().slice(0, 10)) {
      this.errors[field] = 'Date cannot be in the past';
    }
    return s;
  }
  done(): void {
    if (Object.keys(this.errors).length) throw new HttpError(422, 'Please fix the highlighted fields', { errors: this.errors });
  }
}
