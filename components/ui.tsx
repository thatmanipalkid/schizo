export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-white px-4 py-6">
      {children}
    </main>
  );
}

export function BackButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Back"
      disabled={disabled}
      onClick={onClick}
      className="mb-5 inline-flex min-h-[42px] items-center gap-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span aria-hidden="true" className="text-xl leading-none">←</span>
      <span>Back</span>
    </button>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-sm text-muted">{children}</label>
  );
}

export function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        {...props}
        className="min-h-[42px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-accent"
      />
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-[42px] w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-[42px] w-full items-center justify-center rounded-lg border border-line bg-white px-4 text-sm text-ink disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function StatusText({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-base text-muted">{children}</p>
  );
}
