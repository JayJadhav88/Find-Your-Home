import { IMPORT_COLUMNS } from "@fyh/shared";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getViewer, isAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

// Excel template: a "Listings" sheet with the columns and one example row, a "Help" sheet
// explaining each column, and a "Lists" sheet with the names this site accepts right now.
export async function GET() {
  const viewer = await getViewer();
  if (!isAdmin(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createUserClient();
  const [types, amenities, locations, currencies] = await Promise.all([
    supabase.from("property_types").select("name").eq("is_active", true).order("sort_order"),
    supabase.from("amenities").select("name").eq("is_active", true).order("sort_order"),
    supabase.from("locations").select("id, parent_id, level, name").eq("is_active", true).order("name"),
    supabase.from("currencies").select("code").eq("is_enabled", true).order("code"),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Find Your Home";

  const listings = workbook.addWorksheet("Listings", { views: [{ state: "frozen", ySplit: 1 }] });
  listings.columns = IMPORT_COLUMNS.map((column) => ({
    header: column.required ? `${column.header}` : column.header,
    key: column.header,
    width: Math.min(Math.max(column.header.length + 4, 14), 40),
  }));
  listings.getRow(1).font = { bold: true };
  IMPORT_COLUMNS.forEach((column, index) => {
    listings.getCell(1, index + 1).note = `${column.required ? "Required. " : ""}${column.help}`;
  });
  listings.addRow(Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.header, column.example])));
  listings.getRow(2).font = { italic: true, color: { argb: "FF5C5850" } };

  const help = workbook.addWorksheet("Help");
  help.columns = [
    { header: "Column", key: "header", width: 28 },
    { header: "Required", key: "required", width: 10 },
    { header: "What to enter", key: "help", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const column of IMPORT_COLUMNS) help.addRow({ header: column.header, required: column.required ? "Yes" : "", help: column.help });
  help.addRow({});
  help.addRow({ header: "Notes", help: "Delete the example row (row 2) before importing. One property per row; up to 1000 rows per file." });
  help.addRow({ help: "Images: direct links to JPEG, PNG or WebP files. They are downloaded, checked and stored on this site." });
  help.addRow({ help: "Videos: YouTube or Instagram links. They play on the listing page when a visitor presses play." });

  const byId = new Map((locations.data ?? []).map((location) => [location.id, location]));
  const lists = workbook.addWorksheet("Lists");
  lists.columns = [
    { header: "Category", key: "category", width: 16 },
    { header: "Property type", key: "type", width: 22 },
    { header: "Amenities", key: "amenity", width: 26 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Place", key: "place", width: 28 },
    { header: "Level", key: "level", width: 12 },
    { header: "Inside", key: "inside", width: 28 },
  ];
  lists.getRow(1).font = { bold: true };
  const categories = ["Rental", "Resale", "New project"];
  const rows = Math.max(categories.length, types.data?.length ?? 0, amenities.data?.length ?? 0, currencies.data?.length ?? 0, locations.data?.length ?? 0);
  for (let index = 0; index < rows; index++) {
    const place = locations.data?.[index];
    lists.addRow({
      category: categories[index] ?? "",
      type: types.data?.[index]?.name ?? "",
      amenity: amenities.data?.[index]?.name ?? "",
      currency: currencies.data?.[index]?.code ?? "",
      place: place?.name ?? "",
      level: place?.level ?? "",
      inside: place?.parent_id ? (byId.get(place.parent_id)?.name ?? "") : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="find-your-home-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
