# Replate — local demonstration setup

Replate is a React + Express + MySQL demonstration of food donation posting and claiming. **Login and role-based authorization are not yet implemented**. The donor is selected by a fixed *fictional demo organization name* on the backend; the recipient user ID is entered in the UI for local testing. Do not deploy publicly in this form.

## Requirements

- Node.js and npm; MySQL 8; Git; browser.
- Windows PowerShell: use `npm.cmd` if `npm` is blocked by execution policy. On macOS use `npm`.

## Fresh checkout

1. Clone the repository: `git clone https://github.com/mrussell-iu/replate.git` and `cd replate`.
2. Start your local MySQL server. In MySQL Workbench, run **all of** `database/schema.sql`, then **all of** `database/seed.sql`. Both are designed to be rerun without deleting existing donations. These scripts create a fictional donor organization and a recipient account. The `claims` table is used for claim history.
3. Create `backend/.env` (do not commit it):

   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=YOUR_LOCAL_MYSQL_PASSWORD
   DB_NAME=replate
   PORT=3000
   ```

4. In terminal A: `cd backend`, `npm install` (Windows: `npm.cmd install`), `node server.js`.
5. In terminal B, from repository root: `cd frontend`, `npm install` (Windows: `npm.cmd install`), `npm run dev` (Windows: `npm.cmd run dev`). Open the exact Vite URL shown, typically http://localhost:5173.
6. Test http://localhost:3000/api/health and http://localhost:3000/api/donations. Stop older processes occupying port 3000 if needed.

## Post a donation (REQ-3)

1. In React, enter food type, positive quantity, unit, pickup address, pickup date/time, and a **future** claim deadline.
2. Click **Post Donation**. Expect `Donation posted successfully.`
3. Confirm the donation appears in **Available Donations**, then refresh the page. It must remain visible.

## Claim a donation (REQ-4)

1. In MySQL Workbench, run:

   ```sql
   USE replate;
   SELECT user_id, email, role FROM users
   WHERE email='recipient-demo@replate.example';
   ```

2. Enter the returned **user_id** in the React **Demo Recipient User ID** field.
3. Click **Claim Donation** on a newly posted available listing. Expect `Donation claimed successfully.`
4. The listing must disappear from Available Donations and stay gone after refreshing. This verifies database persistence.
5. To inspect claim history, run:

   ```sql
   SELECT d.donation_id, d.status, d.recipient_user_id,
          c.claim_id, c.recipient_id
   FROM donations d LEFT JOIN claims c ON c.donation_id=d.donation_id
   ORDER BY d.donation_id DESC;
   ```

6. To test duplicate claim handling, attempt a second claim of the same donation through the application (e.g. another open browser tab loaded before the first claim). Expect an unavailable/already claimed error.

## Known limitations

- No secure login, authenticated donor selection, or role-based authorization yet. Demo user IDs are not credentials.
- Donor account placeholders in seed.sql are **not valid login hashes**.
- Donation editing exists as a backend endpoint but has no dedicated React editing screen.
- Pickup confirmation, notifications, and full donation history UI remain incomplete.
- The MySQL setup preserves existing tables; if an older schema differs substantially, review it before migration.
- API base URL can be overridden using `VITE_API_BASE_URL` in `frontend/.env.local`, for example `VITE_API_BASE_URL=http://localhost:3000`. Each developer's browser must be able to reach that backend address.

## Submission check

Use a **fresh Git clone**, run the documented SQL setup, and test both workflows before recording. Record `git rev-parse HEAD` after pushing the exact tested commit. Never commit `backend/.env`, passwords, `node_modules`, or nested copies of the repository.
