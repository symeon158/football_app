"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "@/lib/validation/auth";

function fieldErrors(error: z.ZodError): FormState {
  return { ok: false, fieldErrors: z.flattenError(error).fieldErrors };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();

  const { data: available, error: rpcError } = await supabase.rpc("is_username_available", {
    p_username: parsed.data.username,
  });
  if (rpcError) return { ok: false, message: "Could not check the username. Please try again." };
  if (!available) {
    return { ok: false, fieldErrors: { username: ["That username is already taken."] } };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the on_auth_user_created trigger to create the profile.
      data: { username: parsed.data.username },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    // Do not reveal whether an e-mail is registered.
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: [error.message] } };
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { ok: false, message: "Too many attempts. Please wait a minute and try again." };
    }
    return { ok: false, message: "Sign-up failed. Please check your details and try again." };
  }

  if (!data.session) {
    // E-mail confirmation is enabled: the user must click the link first.
    return {
      ok: true,
      message: "Check your inbox to confirm your e-mail address, then sign in.",
    };
  }

  redirect("/dashboard");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, message: "Please confirm your e-mail address first." };
    }
    return { ok: false, message: "Invalid e-mail or password." };
  }

  redirect(safeNextPath(formData.get("next")));
}

/**
 * Step 1 of password reset: e-mail a recovery link. The reply is the same whether or not the
 * address has an account, so the form can't be used to discover who is registered.
 * The link signs the player in (via /auth/confirm) and lands on /reset-password.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password`,
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) {
    return { ok: false, message: "Too many requests. Please wait a few minutes and try again." };
  }
  return {
    ok: true,
    message:
      "If an account uses that e-mail, a reset link is on its way. Open it in this browser — it's valid for one hour.",
  };
}

/** Step 2: the player arrived signed in from the recovery link and chooses a new password. */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return { ok: false, message: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, fieldErrors: { password: ["Choose a password different from your current one."] } };
    }
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: [error.message] } };
    }
    return { ok: false, message: "Could not save the new password. Please request a new reset link." };
  }

  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
