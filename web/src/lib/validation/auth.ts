import { z } from "zod";

/** Must match the CHECK constraint on public.profiles.username. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN, "3–20 characters: letters, numbers and underscores only.");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid e-mail address."));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const signUpSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type FieldErrors = Partial<Record<string, string[]>>;

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
};

export const initialFormState: FormState = { ok: false };
