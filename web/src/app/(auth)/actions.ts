"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, type FormState } from "@/lib/validation/auth";

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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
