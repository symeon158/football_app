"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/use-hydrated";
import { initialFormState, type FormState } from "@/lib/validation/auth";

type Field = {
  name: "username" | "email" | "password" | "confirmPassword";
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
  /** Small link shown beside the label (e.g. "Forgot password?"). */
  aside?: { href: string; label: string };
};

type Mode = "login" | "signup" | "forgot" | "reset";

type Props = {
  mode: Mode;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  next?: string;
  notice?: string;
};

const NEW_PASSWORD_HINT = "8+ characters with a letter and a number";

const MODES: Record<
  Mode,
  { title: string; description: string; submit: string; fields: Field[]; footer?: { text: string; href: string; link: string }; hideAfterSuccess?: boolean }
> = {
  signup: {
    title: "Create your club",
    description: "You'll start with 1,000 Football Coins, a starter squad and your own stadium.",
    submit: "Create club",
    fields: [
      { name: "username", label: "Manager name", type: "text", autoComplete: "username", hint: "3–20 letters, numbers or _" },
      { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
      { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: NEW_PASSWORD_HINT },
    ],
    footer: { text: "Already have a club? ", href: "/login", link: "Sign in" },
  },
  login: {
    title: "Welcome back, manager",
    description: "Sign in to manage your club.",
    submit: "Sign in",
    fields: [
      { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
      {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: "current-password",
        aside: { href: "/forgot-password", label: "Forgot password?" },
      },
    ],
    footer: { text: "New to Football Legends? ", href: "/signup", link: "Create one" },
  },
  forgot: {
    title: "Reset your password",
    description: "Enter your account's e-mail and we'll send you a link to choose a new password.",
    submit: "Send reset link",
    fields: [{ name: "email", label: "E-mail", type: "email", autoComplete: "email" }],
    footer: { text: "Remembered it? ", href: "/login", link: "Back to sign in" },
    hideAfterSuccess: true,
  },
  reset: {
    title: "Choose a new password",
    description: "You're signed in from the reset link. Pick a new password for your account.",
    submit: "Save new password",
    fields: [
      { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: NEW_PASSWORD_HINT },
      { name: "confirmPassword", label: "Repeat new password", type: "password", autoComplete: "new-password" },
    ],
  },
};

export function AuthForm({ mode, action, next, notice }: Props) {
  const config = MODES[mode];
  // React resets the form after each submit; remember what was typed (never passwords) so a
  // failed attempt doesn't make the player retype their e-mail or manager name.
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const rememberTyped = (form: HTMLFormElement) => {
    const data = new FormData(form);
    setTyped(Object.fromEntries(config.fields.filter((f) => f.type !== "password").map((f) => [f.name, String(data.get(f.name) ?? "")])));
  };
  const hydrated = useHydrated();
  const done = Boolean(config.hideAfterSuccess && state.ok);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>

      <form action={formAction} onSubmit={(e) => rememberTyped(e.currentTarget)} noValidate>
        <CardContent className="space-y-4">
          {notice && !state.message && (
            <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          {state.message && (
            <p
              role={state.ok ? "status" : "alert"}
              className={
                state.ok
                  ? "rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
                  : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              }
            >
              {state.message}
            </p>
          )}

          {next && <input type="hidden" name="next" value={next} />}

          {!done &&
            config.fields.map((f) => {
              const error = state.fieldErrors?.[f.name]?.[0];
              const describedBy = error ? `${f.name}-error` : f.hint ? `${f.name}-hint` : undefined;
              return (
                <div key={f.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    {f.aside && (
                      <Link href={f.aside.href} className="text-xs font-medium text-primary hover:underline">
                        {f.aside.label}
                      </Link>
                    )}
                  </div>
                  <Input
                    id={f.name}
                    name={f.name}
                    type={f.type}
                    autoComplete={f.autoComplete}
                    defaultValue={f.type === "password" ? undefined : typed[f.name]}
                    required
                    className="h-10"
                    aria-invalid={Boolean(error)}
                    aria-describedby={describedBy}
                  />
                  {error ? (
                    <p id={`${f.name}-error`} className="text-xs text-destructive">{error}</p>
                  ) : f.hint ? (
                    <p id={`${f.name}-hint`} className="text-xs text-muted-foreground">{f.hint}</p>
                  ) : null}
                </div>
              );
            })}
        </CardContent>

        <CardFooter className="mt-6 flex flex-col gap-3">
          {!done && (
            <Button type="submit" className="h-10 w-full" disabled={pending || !hydrated}>
              {pending ? "Please wait…" : config.submit}
            </Button>
          )}
          {config.footer && (
            <p className="text-sm text-muted-foreground">
              {config.footer.text}
              <Link href={config.footer.href} className="font-medium text-primary hover:underline">
                {config.footer.link}
              </Link>
            </p>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
