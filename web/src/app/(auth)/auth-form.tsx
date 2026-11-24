"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/lib/use-hydrated";
import { initialFormState, type FormState } from "@/lib/validation/auth";

type Field = {
  name: "username" | "email" | "password";
  label: string;
  type: string;
  autoComplete: string;
  hint?: string;
};

type Props = {
  mode: "login" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  next?: string;
  notice?: string;
};

const FIELDS: Record<Props["mode"], Field[]> = {
  signup: [
    { name: "username", label: "Manager name", type: "text", autoComplete: "username", hint: "3–20 letters, numbers or _" },
    { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "8+ characters with a letter and a number" },
  ],
  login: [
    { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
  ],
};

export function AuthForm({ mode, action, next, notice }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const hydrated = useHydrated();
  const isSignup = mode === "signup";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isSignup ? "Create your club" : "Welcome back, manager"}</CardTitle>
        <CardDescription>
          {isSignup
            ? "You'll start with 1,000 Football Coins, a starter squad and your own stadium."
            : "Sign in to manage your club."}
        </CardDescription>
      </CardHeader>

      <form action={formAction} noValidate>
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

          {FIELDS[mode].map((f) => {
            const error = state.fieldErrors?.[f.name]?.[0];
            const describedBy = error ? `${f.name}-error` : f.hint ? `${f.name}-hint` : undefined;
            return (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input
                  id={f.name}
                  name={f.name}
                  type={f.type}
                  autoComplete={f.autoComplete}
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
          <Button type="submit" className="h-10 w-full" disabled={pending || !hydrated}>
            {pending ? "Please wait…" : isSignup ? "Create club" : "Sign in"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isSignup ? "Already have a club? " : "New to Football Legends? "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-primary hover:underline">
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
