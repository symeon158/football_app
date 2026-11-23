import type { Metadata } from "next";
import { Suspense } from "react";

import { signIn } from "../actions";
import { AuthForm } from "../auth-form";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in" };

async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const notice =
    params.error === "confirmation_failed"
      ? "That confirmation link is invalid or has expired. Please sign in or sign up again."
      : undefined;
  return <AuthForm mode="login" action={signIn} next={safeNextPath(params.next)} notice={notice} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    // The form itself is static; only the ?next / ?error params are request-time.
    <Suspense fallback={<AuthForm mode="login" action={signIn} />}>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}
