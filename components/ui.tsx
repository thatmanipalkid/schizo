export function BrandHeader() {
  return (
    <div className="mb-5">
      <p className="italic font-bold text-[#4FAE7A]" style={{ fontFamily: "Georgia, serif" }}>
        thatmanipalkid
      </p>
      <p className="text-[11px] italic text-muted tracking-wide">
        Hari patti, Aankhein Laal
      </p>
    </div>
  );
}

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
        className="min-h-[42px] w-full rounded-lg border border-[#E4DFD3] bg-white px-3 text-base text-ink outline-none focus:border-[#4FAE7A]"
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
      className={`flex min-h-[42px] w-full items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50 ${className}`}
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
      className={`flex min-h-[42px] w-full items-center justify-center rounded-full border border-[#2F6E5E] bg-white px-4 text-sm text-[#2F6E5E] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function UploadButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-[#4FAE7A] px-4 text-sm font-medium text-white disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "red" }) {
  const styles =
    tone === "green"
      ? "bg-[#EAF3DE] text-[#27500A]"
      : "bg-[#FCEBEB] text-[#791F1F]";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] ${styles}`}>
      {children}
    </span>
  );
}

export function StatusText({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-base text-muted">{children}</p>
  );
}
