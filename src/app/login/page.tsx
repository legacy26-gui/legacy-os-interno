import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex flex-col items-center">
            <span className="text-2xl font-black tracking-tight text-foreground">
              LEGACY<span className="text-accent">OS</span>
            </span>
            <span className="text-xs text-foreground-muted tracking-[0.2em] mt-1">
              LEGACY DIGITAL
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
