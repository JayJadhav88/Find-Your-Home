import { signInWithGoogle } from "@/app/actions/auth";

/** Shown when Google sign-in is configured (NEXT_PUBLIC_GOOGLE_SIGN_IN=true). */
export function GoogleSignInButton({ next }: { next: string }) {
  if (process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN !== "true") return null;
  return (
    <div className="flex flex-col gap-4">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-2 font-medium hover:bg-surface-muted"
        >
          <span aria-hidden className="text-lg font-bold text-brand">G</span>
          Continue with Google
        </button>
      </form>
      <p className="text-center text-sm text-text-muted">or use your email</p>
    </div>
  );
}
