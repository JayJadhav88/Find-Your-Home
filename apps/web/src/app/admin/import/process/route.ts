import { prepareImportRows, type ImportRow, type ImportRowError } from "@fyh/shared";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewer, isAdmin } from "@/lib/auth";
import { readSpreadsheet, SpreadsheetError } from "@/lib/spreadsheet";
import { createUserClient } from "@/lib/supabase";

// Admin spreadsheet import. A route handler (not a Server Action) so files up to 5 MB can be
// uploaded without raising the body limit for every form. mode=preview validates only;
// mode=import validates again and inserts through the admin_import_listings RPC.

export interface ImportResponse {
  fileName: string;
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
  unknownHeaders: string[];
  missingRequired: string[];
  tooManyRows: boolean;
  preview: Array<Pick<ImportRow, "row_number" | "title" | "category"> & { images: number; videos: number }>;
  imported?: {
    batchId: string;
    count: number;
    results: Array<{ row: number; ok: boolean; listing_id?: string; reference_code?: string; status?: string; images_pending?: number; error?: string }>;
  };
  error?: string;
}

const fields = z.object({
  mode: z.enum(["preview", "import"]),
  ownerId: z.uuid(),
  publish: z.enum(["1", "0"]),
});

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.headers.get("host");
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return NextResponse.json({ error: "Only administrators can import listings" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const input = fields.safeParse({ mode: form.get("mode"), ownerId: form.get("ownerId"), publish: form.get("publish") });
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  if (!input.success) return NextResponse.json({ error: "Choose the account the listings belong to" }, { status: 400 });

  let sheet;
  try {
    sheet = await readSpreadsheet(await file.arrayBuffer(), file.name);
  } catch (failure) {
    const message = failure instanceof SpreadsheetError ? failure.message : "The file could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Fresh (uncached) reference data so names added a moment ago resolve.
  const supabase = await createUserClient();
  const [types, amenities, locations, currencies] = await Promise.all([
    supabase.from("property_types").select("id, name, slug").eq("is_active", true),
    supabase.from("amenities").select("id, name, slug").eq("is_active", true),
    supabase.from("locations").select("id, parent_id, level, name, slug").eq("is_active", true),
    supabase.from("currencies").select("code").eq("is_enabled", true),
  ]);
  const { rows, errors } = prepareImportRows(sheet.records, {
    propertyTypes: types.data ?? [],
    amenities: amenities.data ?? [],
    locations: locations.data ?? [],
    currencies: currencies.data ?? [],
  });

  const response: ImportResponse = {
    fileName: file.name,
    totalRows: rows.length + errors.length,
    validRows: rows.length,
    errors,
    unknownHeaders: sheet.unknownHeaders,
    missingRequired: sheet.missingRequired,
    tooManyRows: sheet.tooManyRows,
    preview: rows.slice(0, 50).map((row) => ({
      row_number: row.row_number,
      title: row.title,
      category: row.category,
      images: row.image_urls.length,
      videos: row.videos.length,
    })),
  };

  if (input.data.mode === "preview" || sheet.missingRequired.length || !rows.length) {
    return NextResponse.json(response);
  }

  const { data, error } = await supabase.rpc("admin_import_listings", {
    p_owner_id: input.data.ownerId,
    p_publish: input.data.publish === "1",
    p_file_name: file.name.slice(0, 200),
    p_rows: rows as unknown as never,
  });
  if (error) return NextResponse.json({ ...response, error: error.message }, { status: 400 });

  const result = data as { batch_id: string; imported: number; results: NonNullable<ImportResponse["imported"]>["results"] };
  revalidateTag("listings", { expire: 0 });
  return NextResponse.json({ ...response, imported: { batchId: result.batch_id, count: result.imported, results: result.results } });
}
