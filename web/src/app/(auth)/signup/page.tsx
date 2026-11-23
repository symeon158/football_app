import type { Metadata } from "next";

import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create your club" };

export default function SignUpPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
