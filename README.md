# The Editor — Frontend UI

Frontend dashboard for the Sunday Cues sermon clip identification service.

## Stack

- React 18 + Vite
- Zero external UI dependencies
- Connects to: https://sermon-editor-production.up.railway.app

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel

### Option 1 — Vercel CLI (fastest)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Done.

### Option 2 — GitHub + Vercel dashboard

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project
3. Import the repo
4. Framework preset: Vite
5. No environment variables needed
6. Click Deploy

Your app will be live at a `.vercel.app` URL in about 60 seconds.

## Project structure

```
src/
  App.jsx              # Root component + navigation state
  api.js               # All API calls to Railway backend
  useClients.js        # Client list stored in localStorage
  index.css            # Global styles + CSS variables
  components/
    Sidebar.jsx        # Navigation sidebar
    ui.jsx             # Shared primitives (Button, Modal, Badge, etc.)
    SermonRow.jsx      # Reusable sermon list row
    SubmitModal.jsx    # Submit sermon form (URL or drag-drop)
    AddClientModal.jsx # Add new client form
  pages/
    DashboardPage.jsx  # Overview stats + recent sermons
    SermonsPage.jsx    # All sermons list + per-client view
    SermonDetailPage.jsx # Clips view with auto-polling
```

## Notes

- Client data is stored in localStorage (browser only, per device)
- Direct file upload is UI-ready but the Railway API currently requires a hosted URL
- Processing status auto-polls every 5 seconds until complete
- Built for Sunday Cues by Richard Om
