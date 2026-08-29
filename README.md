# Converge Check-in — Next.js app

Quick local dev:

1. Install dependencies
   npm install

2. Run dev server
   npm run dev

Open http://localhost:3000

Notes:
- Server persistence uses Netlify Database (managed Postgres) via Drizzle ORM. Schema lives in `db/schema.js`; migrations are generated with `npx drizzle-kit generate` and applied automatically by Netlify on deploy.
- The UI component runs client-side (dynamic import) to avoid SSR issues with file inputs and browser APIs.
- Add environment-specific configuration and authentication before deploying to a public environment.

Deploying to Netlify (recommended steps):
1. Create a Netlify site and connect your Git repository.
2. Ensure netlify.toml is present (provided) and that the repository contains the project.
3. Set build command: npm run build and publish directory: .next (Netlify plugin config in netlify.toml will handle routing).
4. The Netlify Database connects automatically — no connection string configuration needed.
5. By default the API routes are open (no admin-only restrictions). If you want to protect the Control Room or restrict writes in production, set ADMIN_EMAIL and ADMIN_PASSWORD and update the frontend to require login; alternatively keep the APIs open for a very simple kiosk setup.

Attendee sign-in options:
- The kiosk accepts a full name, a code starting with "CF001" (case-insensitive), or a phone number (7+ digits). The value provided is stored on the check-in record as name/code/phone fields for later lookup.

Additional Netlify notes:
- Environment variables to consider: ADMIN_EMAIL (optional), ADMIN_PASSWORD (optional), ADMIN_JWT_SECRET (optional).

Quick checklist before public deploy:
- Add authentication for admin/control routes (ADMIN_PASSWORD env var added; frontend prompts for it).
- Add rate-limiting, input validation, and request size limits for uploads.

If you'd like, I can now:
- Add camera-based QR scanning to the kiosk, OR
- Harden auth with token-based sessions and rotateable API keys for admin usage.
