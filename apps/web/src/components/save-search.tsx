import { saveSearch } from "@/app/actions/extras";
import { ActionForm } from "./action-form";
import { TextInput } from "./ui";

/** "Save this search": alerts when new homes match (sign-in required). */
export function SaveSearch({ query }: { query: string }) {
  return (
    <ActionForm action={saveSearch} submitLabel="Save search & get alerts" variant="secondary" inline resetOnSuccess>
      <input type="hidden" name="query" value={query} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <TextInput bare name="name" placeholder="e.g. 2BHK in Pune" maxLength={80} />
      </label>
    </ActionForm>
  );
}
