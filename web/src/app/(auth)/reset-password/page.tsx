import type { Metadata } from "next";

import { resetPassword } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Signed-in only (the proxy sends anyone else to /login); reached from the recovery e-mail. */
export default function ResetPasswordPage() {
  return <AuthForm mode="reset" action={resetPassword} />;
}
