import { reportListing } from "@/app/actions/extras";
import { ActionForm } from "./action-form";
import { Field, Select, TextArea } from "./ui";

const REASONS = [
  ["fraud", "Looks like a scam (asks for money upfront, fake)"],
  ["wrong_info", "Wrong details or photos"],
  ["unavailable", "No longer available"],
  ["duplicate", "Listed more than once"],
  ["offensive", "Offensive content"],
  ["other", "Something else"],
] as const;

export function ReportListing({ listingId }: { listingId: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-text-muted underline">Report this listing</summary>
      <div className="mt-3">
        <ActionForm action={reportListing} submitLabel="Send report" variant="secondary">
          <input type="hidden" name="listingId" value={listingId} />
          <Field label="What's wrong?" name="reason">
            <Select name="reason" defaultValue="fraud">
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Details (optional)" name="details">
            <TextArea name="details" rows={3} maxLength={1000} />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}
