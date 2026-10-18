# 08 · Adding many properties from Excel

For administrators. Admin panel → **Import from Excel**.

## 1. Get the template

Click **Download the Excel template**. It has three sheets:

| Sheet | What it is |
| --- | --- |
| Listings | Fill this one: one property per row. Row 2 is an example; delete it. Hover a column heading to see what it expects. |
| Help | Every column explained. |
| Lists | The exact categories, property types, amenities, currencies and places this site accepts **right now**. Add missing ones in Admin → Types, amenities & places (or Settings for currencies) before importing. |

## 2. Fill it in

- **Category** (required): `Rental`, `Resale` or `New project`. New projects must belong to a builder account (step 3) and need a **Project name**.
- **Title** (required): 3–140 characters.
- **Place names** (Country, Region, City, Locality) and **Property type** / **Amenities** must match the Lists sheet; capitals and spacing don't matter.
- **Price** is a number (`250000`, `2,50,000` and `$250,000` all work) with an enabled **Currency** code.
- **Image URLs**: direct links to JPEG, PNG or WebP files (the address usually ends in `.jpg`, `.png` or `.webp`), separated by commas or new lines; up to 30. The first one becomes the cover photo. Links to web pages (e.g. a Google Drive "view" page) are not images and will fail.
- **Video URLs**: YouTube links (`youtube.com/watch?v=…`, `youtu.be/…`, Shorts) or Instagram post/reel links (`instagram.com/reel/…`, `/p/…`), separated by commas or new lines; up to 10.
- Leave optional columns empty if unknown.

Excel `.xlsx` or `.csv`; up to 5 MB and 1000 rows per file.

## 3. Check, then import

1. Choose the file and **who the listings belong to** (an owner, agent or builder account — use a builder account for new projects).
2. Choose what happens after import:
   - **Send to the review queue** — moderators check each one first (safest), or
   - **Publish complete listings immediately** — listings with everything needed (photo, price, city, area, description of 30+ characters…) go live; incomplete ones go to the review queue instead.
3. Click **Check file**. Nothing is saved yet. Rows with problems are listed with the exact reason (e.g. *City "Pune" was not found in that country*). Fix them and check again, or import the ready rows now.
4. Click **Import N listings**.

## 4. Images download in the background

The site downloads each image link once, checks it is a real image, removes hidden data such as GPS location, and stores its own copy, so listings keep working even if the original link disappears. Until that finishes the import shows "downloading images"; **Recent imports** shows the progress. A link that can't be downloaded (broken, not an image, too large, or not a public `https://` address) is skipped; if a listing ends up with no photo it goes to the review queue so someone can add one.

## 5. Videos

Videos appear on the listing page and in the admin review page as a play button. YouTube or Instagram content is loaded only when someone presses play (no cookies from them before that).
