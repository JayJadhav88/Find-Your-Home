import { NextResponse } from "next/server";
import { getViewer, isAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

// CSV exports for administrators. Each export is recorded in the audit log before the
// file is returned. Enquiry exports contain personal data: handle the file accordingly.

function csv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Prevent spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => cell(row[header])).join(","))].join("\r\n");
}

export async function GET(_request: Request, context: RouteContext<"/admin/export/[kind]">) {
  const { kind } = await context.params;
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createUserClient();
  let rows: Array<Record<string, unknown>>;
  if (kind === "listings") {
    const { data, error } = await supabase
      .from("listings")
      .select("reference_code, title, status, purpose, price_amount, currency, price_period, bedrooms, bathrooms, area_value, area_unit, is_featured, created_at, submitted_at, published_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });
    rows = data ?? [];
  } else if (kind === "enquiries") {
    const { data, error } = await supabase
      .from("enquiries")
      .select("created_at, kind, status, visit_status, requested_visit_at, requested_timezone, name, email, phone, listing:listings(reference_code)")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) return NextResponse.json({ error: "Export failed" }, { status: 500 });
    rows = (data ?? []).map(({ listing, ...row }) => ({ listing: listing?.reference_code ?? "", ...row }));
  } else {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const { error } = await supabase.rpc("admin_record_export", { p_kind: kind, p_rows: rows.length });
  if (error) return NextResponse.json({ error: "Export could not be recorded" }, { status: 500 });

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
