# Supabase setup

Player accounts are anonymous: no email or password. A player picks an @handle and enters a
first and last name. Only the handle is public; names are readable by their owner alone.

1. Run each file in `migrations/` in filename order (SQL editor, or `supabase db push`):
   profiles first, then Morning Rush (scores and leaderboard).
2. Authentication > Sign In / Providers: turn on **Allow anonymous sign-ins**.
3. Authentication > Attack Protection: turn on CAPTCHA (Cloudflare Turnstile). Anonymous
   sign-ups are otherwise unlimited from any script.
4. Copy `.env.example` to `.env.local` (and the hosting provider's env vars) with the project's
   URL and publishable key from Project Settings > API Keys.

Until step 4 is done the game runs as before and the "Claim handle" button stays hidden.

An anonymous account lives in one browser. Clearing site data or switching devices starts a
new player, and the old handle stays taken.
