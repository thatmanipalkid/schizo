import { Screen } from "@/components/ui";

export default function LeftSessionPage() {
  return (
    <Screen>
      <h1 className="text-xl font-semibold">You&apos;ve left this session</h1>
      <p className="mt-2 text-sm text-muted">
        You are no longer included in the split.
      </p>
    </Screen>
  );
}