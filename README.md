# Auto Audit Calendar & Booking

A general calendar, booking, and form application built with Next.js, TypeScript, HeroUI, Tailwind, and PostgreSQL. All built-in interface text is English. Customer booking pages, public forms, and account pages prioritize mobile screens.

Public application: https://calendar.dbautoaudit.stream
Local origin: http://127.0.0.1:3210

## Company registration

1. Select **Create a company account** from the centered sign-in card.
2. Enter the company or brand name, email address, contact person's phone number, password, and matching confirmation.
3. Passwords need at least eight characters. There are no uppercase, number, symbol, or strength requirements.
4. Email addresses are normalized to lowercase. Phone numbers are normalized, so `0812…` and `+62 812…` are treated as the same number. Database unique indexes reject duplicate account emails and phone numbers, including concurrent submissions.
5. Registration creates a Company Owner and company with **Pending approval** status. Pending and rejected accounts cannot sign in.
6. Super Admin reviews registrations under **Pending companies** and approves or rejects them. Approved owners can sign in with the password they created. Rejections may include a reason recorded for administrators.

## Super Admin

Super Admin has a dedicated administration interface: **Companies**, **Pending companies**, **User access**, **Audit log**, and **Platform settings**. This interface has no personal calendar or time slot creation menu.

- **Create company** creates an approved company and a separate Owner account with unique email and phone details. Super Admin does not become that company's Owner.
- **Edit company** manages company details, time zone, and active/inactive/archived status.
- **Set up company owner** creates an Owner for a legacy company that currently has only a Super Admin membership.
- **Login as company** opens the active Owner's workspace in the current session. Access is limited to that company. **Return to Super Admin** restores administration mode. Both actions are audited.
- **Footer watermark** controls the footer on that company's booking pages, confirmations, and forms: the default "supported by Auto Audit", no footer, or custom text and image with adjustable text size and image width. Only Super Admin can change it; company users, including Owners, cannot.
- **Reset password** sets a new password directly, with matching confirmation and the same eight-character rule. Existing account sessions and activation links are revoked. Passwords are hashed and are not stored in audit logs. Share the new password privately with the Owner.

## Company workspace

1. Open **Calendars** and create a calendar for a service, appointment, event, consultation, or other booking purpose.
2. Set its title, booking link slug, description, location or meeting link, time zone, and optional booking window.
3. Add customer questions through the form builder. The standard fields are name, email, phone, and booking consent. The form preview defaults to mobile.
4. Add individual time slots or generate them in a date range. Each slot has its own capacity.
5. Customize branding and the confirmation page. WhatsApp contact is optional and only opens after the customer clicks its button.
6. Publish the calendar and share `/b/company-slug/calendar-slug`.
7. Customers choose a date and time, enter their details, and review the booking before confirming. The selected time remains visible during the form steps.
8. Manage bookings, attendance, cancellations, and rescheduling from **Bookings**. Configure team memberships, roles, and permissions as needed.

Booking transactions preserve capacity and tenant isolation. Repeated requests with the same idempotency key return the same confirmation. Historical form responses preserve their original questions and form versions. Inactive companies stop accepting new bookings without cancelling existing ones.

## Forms

**Forms** sits below **Calendars** in the company workspace. A company can have any number of forms, each with its own link `/f/company-slug/form-slug`.

1. Select **New form**, enter a title, choose the language of the built-in buttons and messages (English or Bahasa Indonesia), and start from a blank form or a template.
2. The builder has three parts: the block list on the left, a live phone or desktop preview in the middle, and the settings of the selected item on the right. On small screens the three parts become **Blocks**, **Edit**, and **Preview** tabs.
3. Add blocks from the palette by clicking them or dragging them into the list. Drag the handle to reorder, or use the row menu to duplicate, move, or delete. Available blocks: name, email, phone, short text, long text, statement, multiple choice, checkboxes, dropdown, yes/no, rating, opinion scale, number, date, and upload file.
4. Each block has a question, optional description, required switch, and its own options, such as answer options, placeholder, length or value limits, number of stars, and scale labels. Pasting several lines into an answer option creates one option per line.
5. **Logic** sends respondents to a later question or to a specific ending, per answer for multiple choice, dropdown, and yes/no, or for every answer of other blocks. Jumps only go forward, so every path ends. A jump is reset when its target is removed or moved earlier.
6. **Design** sets the logo (company logo, a custom logo, or none), a banner image for the welcome screen or every screen, the button color, a background, the progress bar, and question numbers. Images are PNG, JPEG, or WebP up to 5 MB and are stored as WebP.
7. Each form has one or more **ending pages**. An ending has a title, message, an icon or an uploaded image, up to six link buttons (web address, WhatsApp link, `mailto:`, or `tel:`) with their own style and icon, and an optional **fill out again** button. The first ending is the default.
8. **Publish** makes the form reachable. **Closed** forms show a closed message; draft and archived forms cannot be opened by respondents. Changing a published form requires the publish permission.

Respondents see one question per screen with a progress bar. On a keyboard, Enter continues and letter or number keys pick an answer.

Answers are saved while the form is being filled in: shortly after the respondent stops typing, and immediately when they move to another question. A response therefore exists from the first answer and is marked **Partial** until it is submitted, then **Completed**. Partial responses keep what was typed, even if it is not yet valid; submission validates every question on the path the respondent took. Reopening the link on the same device within seven days continues the same response.

**Responses** (from a form card) shows totals, the completion rate, search, a Partial/Completed filter, each response with the question it stopped at or the ending it reached, CSV export, and deletion of individual responses. Answers to questions that were later removed stay visible.

**Upload file** accepts one file per question, up to **5 MB (5,242,880 bytes)**: JPEG, JPG, PNG, SVG, PDF, MD, DOC, DOCX, XLSX, and CSV. The browser shows transfer percentage, then “Saving file” until the server confirms success. Moving back during a transfer requires confirmation; leaving or refreshing the page triggers the browser's warning. Upload can also be cancelled explicitly. Failed transfers can be retried by choosing the file again. The preview explains that uploads are available on the published form.

Files are private in `UPLOAD_DIR/form-files`; migration `008_form_files.sql` stores metadata tied to the company, form, and response. Migrations `009` and `010` add the final 30-day expiry policy. Files appear as downloadable links in Responses. **Download all files as ZIP** exports current attachments from every Partial and Completed response, independently of table filters, and requires `responses.export`. Individual downloads require `responses.read`. SVG and other formats download as attachments with `nosniff` and sandbox headers. Deleting a response deletes its metadata and files.

Transfers stream to disk with a 5 MB byte counter, 120-second timeout, and at most four concurrent uploads per server process. ZIP generation streams one file at a time, uses uncompressed ZIP entries to reduce CPU load, and allows two concurrent exports per process. Busy requests return a retryable error. Cancelling a request releases resources and removes unfinished data. Attachments expire **30 days from upload**. The company Responses page shows a live countdown, each file’s remaining time, and a reminder to download before expiry. Expired files cannot be downloaded or included in ZIP; text answers and original file names remain saved. Indexed cleanup starts with the first API request and runs every minute while the server is running (up to 500 attachments per sweep); `npm run uploads:cleanup` also runs it manually. Superseded attachments are kept for seven days; crash leftovers and orphaned disk files are removed after 24 hours. Include the entire upload directory in backups.

Permissions: `forms.read`, `forms.create`, `forms.update`, `forms.publish`, `forms.archive`, `responses.read`, `responses.export`, and `responses.delete`. Migration `005_form_permissions.sql` gives existing roles the form permission that matches what they already hold for calendars and bookings.

## Installation and operations

Node.js 22+ and PostgreSQL are required. For a new installation, copy `.env.example` to `.env`, configure the database and application origin, then run:

```sh
npm ci
npm run migrate
npm run bootstrap -- email@company.com
npm test
npm run build
```

The existing deployment uses the dedicated database and role `auto_audit_interview`, persistent uploads at `/home/oem/.local/share/auto-audit-interview/uploads`, and PM2 process `auto-audit-interview`. These infrastructure identifiers are retained for compatibility. Do not rerun `scripts/provision.mjs` against an existing installation.

Cloudflare Tunnel `n8n-autoaudit` forwards the public hostname to `127.0.0.1:3210`. `.env` uses the HTTPS public application origin and Secure session cookies. The application listens only on loopback. SMTP is not configured; invitation links can be shared manually.

Before updating, create a backup with `node --env-file=.env scripts/backup.mjs`. Apply numbered migrations with `npm run migrate`, run checks, build, then restart only this application. `npm run build` replaces the files the running process serves, so restart straight after it; to check a build without touching the live one, build a copy of the project in another directory.

```sh
/home/oem/.npm-global/bin/pm2 restart auto-audit-interview --update-env
curl http://127.0.0.1:3210/api/health/ready
```

To try changes next to the live process, run a development server on another port with its own origin: `APP_URL=http://localhost:3211 COOKIE_SECURE=false npx next dev -H 127.0.0.1 -p 3211`. It writes to `.next/dev`, leaves the live build alone, and uses the same database, so use temporary test data and remove it afterwards.

Backups include a PostgreSQL dump and persistent uploads. `scripts/restore-check.mjs` verifies a dump in a separate temporary database. Restore production data into a new database and verify it before changing the application connection. Preserve `.env` separately from backups.

## Validation

`npm test` runs integration tests against PostgreSQL with temporary data that is cleaned up. Coverage includes registration validation, concurrent duplicate contact details, approval/rejection, scoped company access, direct password reset, legacy Owner setup, booking capacity, idempotency, tenant isolation, role permissions, form versions, and request origin checks. For forms it covers definition rules, logic paths, tenant isolation and permissions, partial saving, submission validation and replay, closed forms, response listing, export and deletion, and image uploads.

`npm run typecheck` and `npm run build` verify the TypeScript source and production build. Current results are recorded in `TEST-RESULTS.md`.

## UI assets

- Auto Audit logo: transparent PNG edited through built-in imagegen; prompt and asset details are in `docs/logo-edit.txt`.
- React Bits Micro: **LatticeLoader** for loading feedback and **HoldButton** for company rejection confirmation, downloaded from the official TypeScript registry and vendored under `components/reactbits`. License: `public/REACTBITS-LICENSE.txt` (MIT + Commons Clause).
- Local Lottie animation: `public/pulse.json`, used for success and empty states, with a static icon for reduced motion.
- All motion honors the device's reduced-motion preference.
- Lucide icons and the existing Magic UI border component remain available.
- The form builder uses dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, MIT) for dragging blocks and answer options, including keyboard reordering.

Internal database names such as `campaigns` and `interview_slots`, and legacy WhatsApp template variables, remain compatible with existing records. The interface uses general calendar and booking terminology. External calendar synchronization and automatic email or WhatsApp delivery are not implemented.
