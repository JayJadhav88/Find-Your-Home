"use client";

import { CATEGORY_LABEL } from "@fyh/shared";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { ImportResponse } from "@/app/admin/import/process/route";
import { Alert, Button, Field, Select } from "./ui";

export interface OwnerOption {
  id: string;
  label: string;
  isBuilder: boolean;
}

/** Two steps: check the file (no changes), then import. The same file is sent both times. */
export function ImportForm({ owners, defaultOwnerId }: { owners: OwnerOption[]; defaultOwnerId: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [publish, setPublish] = useState("0");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(mode: "preview" | "import") {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel (.xlsx) or CSV file first.");
      return;
    }
    setError(null);
    if (mode === "preview") setResult(null);
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    body.set("ownerId", ownerId);
    body.set("publish", publish);
    startTransition(async () => {
      try {
        const response = await fetch("/admin/import/process", { method: "POST", body });
        const json = (await response.json()) as ImportResponse;
        if (!response.ok && !json.fileName) {
          setError(json.error ?? "The import failed.");
          return;
        }
        setResult(json);
        if (json.error) setError(json.error);
      } catch {
        setError("The server could not be reached. Please try again.");
      }
    });
  }

  const owner = owners.find((option) => option.id === ownerId);
  const canImport = result && !result.imported && result.validRows > 0 && !result.missingRequired.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Spreadsheet" name="import-file" hint="Excel .xlsx or .csv, up to 5 MB and 1000 rows">
          <input
            ref={fileInput}
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            onChange={() => setResult(null)}
          />
        </Field>
        <Field label="Listings belong to" name="import-owner" hint="New projects need a builder account">
          <Select name="import-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            {owners.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.isBuilder ? " (builder)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">After import</legend>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="publish" value="0" checked={publish === "0"} onChange={() => setPublish("0")} className="size-4" />
            Send to the review queue
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="radio" name="publish" value="1" checked={publish === "1"} onChange={() => setPublish("1")} className="size-4" />
            Publish complete listings immediately
          </label>
        </fieldset>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => send("preview")}>
          {pending && !result ? "Checking…" : "Check file"}
        </Button>
        {canImport ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Import ${result.validRows} listing(s) for ${owner?.label ?? "the chosen account"}?`)) send("import");
            }}
          >
            {pending ? "Importing…" : `Import ${result.validRows} listing${result.validRows === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {result ? <ImportSummary result={result} /> : null}
      </div>
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResponse }) {
  if (result.imported) {
    const failed = result.imported.results.filter((row) => !row.ok);
    const waiting = result.imported.results.filter((row) => row.ok && (row.images_pending ?? 0) > 0).length;
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success" title={`Imported ${result.imported.count} of ${result.validRows} listing(s) from ${result.fileName}`}>
          {waiting
            ? `${waiting} listing(s) are waiting for their images to download. They are published or sent to review automatically when that finishes.`
            : "All imported listings are ready."}
        </Alert>
        {failed.length ? (
          <Alert tone="danger" title={`${failed.length} row(s) could not be imported`}>
            <ul className="list-disc pl-5">
              {failed.map((row) => (
                <li key={row.row}>Row {row.row}: {row.error}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <ImportedTable rows={result.imported.results.filter((row) => row.ok)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {result.missingRequired.length ? (
        <Alert tone="danger" title="Missing required columns">
          Add these columns to the first row: {result.missingRequired.join(", ")}. Download the template for the full list.
        </Alert>
      ) : null}
      {result.unknownHeaders.length ? (
        <Alert tone="warning" title="Columns that will be ignored">{result.unknownHeaders.join(", ")}</Alert>
      ) : null}
      {result.tooManyRows ? <Alert tone="warning">Only the first 1000 rows were read. Split the file to import the rest.</Alert> : null}
      <Alert tone={result.errors.length ? "warning" : "success"} title={`${result.validRows} of ${result.totalRows} row(s) are ready to import`}>
        {result.errors.length ? "Fix the rows below and check the file again, or import the ready rows now." : "No problems found."}
      </Alert>
      {result.errors.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Rows with problems</caption>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="p-3">Row</th>
                <th scope="col" className="p-3">Title</th>
                <th scope="col" className="p-3">Problems</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((row) => (
                <tr key={row.row_number} className="border-b border-border align-top last:border-0">
                  <td className="p-3">{row.row_number}</td>
                  <td className="p-3">{row.title || "—"}</td>
                  <td className="p-3">
                    <ul className="list-disc pl-4 text-danger">
                      {row.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.preview.length ? (
        <details className="rounded-xl border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">Preview the ready rows</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {result.preview.map((row) => (
              <li key={row.row_number}>
                Row {row.row_number}: {row.title} — {CATEGORY_LABEL[row.category]}, {row.images} image(s), {row.videos} video(s)
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ImportedTable({ rows }: { rows: NonNullable<ImportResponse["imported"]>["results"] }) {
  if (!rows.length) return null;
  const label: Record<string, string> = { published: "Live", pending_review: "In review", draft: "Downloading images" };
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">Imported listings</caption>
        <thead className="border-b border-border text-text-muted">
          <tr>
            <th scope="col" className="p-3">Row</th>
            <th scope="col" className="p-3">Listing</th>
            <th scope="col" className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row} className="border-b border-border last:border-0">
              <td className="p-3">{row.row}</td>
              <td className="p-3">
                <Link href={`/admin/listings/${row.listing_id}`} className="text-brand underline">
                  {row.reference_code}
                </Link>
              </td>
              <td className="p-3">{label[row.status ?? ""] ?? row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
