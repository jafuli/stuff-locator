import { Button } from "@/components/ui/button";

interface HouseholdBootstrapNoticeProps {
  onContinue: () => void;
}

/**
 * Shown by SignUpForm/SignInForm when the best-effort household-bootstrap
 * call (POST /api/household/bootstrap) fails. Non-blocking by design: the
 * caller still auto-navigates to "/" shortly after showing this (see
 * timeoutRef in each form), so this notice is both self-clearing (the
 * redirect happens regardless) and dismissible (this button jumps ahead of
 * that timer). Reuses the same role="alert" + bordered-box pattern as the
 * rest of the auth forms rather than introducing a new notice component or
 * color token.
 */
export function HouseholdBootstrapNotice({ onContinue }: HouseholdBootstrapNoticeProps) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[9px] border-[1.5px] border-line p-3">
      <p className="text-[11.5px] text-mid">
        We couldn&apos;t finish setting up your household. You can still continue — we&apos;ll try again next time you sign
        in.
      </p>
      <Button type="button" variant="secondary" onClick={onContinue} className="self-start">
        Continue
      </Button>
    </div>
  );
}
