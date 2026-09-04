# DocSync — Cloud-Based Document Collaboration System

An open-source, self-hostable alternative to Google Docs / Microsoft Office
Online: real-time collaborative editing, version history, inline comments +
chat, role-based access control, and export to PDF/Word.

Implements Phases 1–7 of the project roadmap:

| Phase | Feature | Status |
|---|---|---|
| 1 | Auth (JWT) + roles (Admin/Editor/Viewer) | ✅ |
| 2 | Document CRUD + dashboard | ✅ |
| 3 | Real-time collaboration (Flask-SocketIO) | ✅ (last-write-wins sync — see note below) |
| 4 | Version history + rollback | ✅ |
| 5 | Inline comments + live chat sidebar | ✅ |
| 6 | Cloud storage (S3) + PDF/Word export | ✅ (S3 optional, falls back to local disk) |
| 7 | Encryption at rest + Docker deployment | ✅ |

> **Real-time sync note:** the WebSocket layer broadcasts full-content updates
> to everyone in the document's room (last-write-wins). This is simple and
> works well for small teams, but it is **not** a CRDT/Operational-Transform
> engine, so two people typing in the exact same spot at the exact same
> moment can clobber each other. For production-grade concurrent editing,
> swap the `content_change` socket handler for a library like
> [Yjs](https://github.com/yjs/yjs) or [ShareDB](https://github.com/share/sharedb).

---

## 1. Project Structure

```
docsync/
├── backend/            Flask REST API + Socket.IO server
│   ├── app.py          Routes, sockets, app factory
│   ├── models.py       SQLAlchemy models (Users, Documents, Versions, Comments, Collaborators)
│   ├── auth.py         JWT auth + role-based access decorators
│   ├── crypto_utils.py Fernet encryption for document content at rest
│   ├── storage.py      S3 upload helper (falls back to local disk)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/           React (Vite) SPA
│   ├── src/
│   │   ├── pages/       Login, Signup, Dashboard, Editor
│   │   ├── api.js        Axios client (attaches JWT)
│   │   └── socket.js      Socket.IO client
│   ├── Dockerfile        (multi-stage build → nginx)
│   └── nginx.conf
├── docker-compose.yml   Full stack: Postgres + Flask + React/nginx
└── README.md
```

---

## 2. Run Locally (no Docker)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # edit secrets as you like; SQLite works out of the box
python app.py                 # runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # runs on http://localhost:5173
```

Open **http://localhost:5173**, sign up (the first account created becomes
`admin` automatically), and start creating documents.

---

## 3. Run with Docker (recommended)

This spins up Postgres, the Flask/Socket.IO backend, and an nginx-served
React build — everything the roadmap's "Docker + Heroku/AWS" deployment step
asks for.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Postgres: localhost:5432 (user/pass: `docsync` / `docsync_password` — **change these**)

To stop: `docker compose down` (add `-v` to also wipe the database volume).

---

## 4. Deploying to the Cloud

You'll need your own hosting account (Anthropic/Claude has no ability to
provision infrastructure or hold credentials on your behalf) — but here are
the concrete paths for each option named in the roadmap.

### Option A — Render / Railway / Fly.io (fastest, free-tier friendly)
1. Push this repo to GitHub.
2. Create a **Web Service** from `backend/Dockerfile` and a **Postgres**
   add-on; set the env vars from `backend/.env.example` (point `DATABASE_URL`
   at the managed Postgres instance).
3. Create a **Static Site / Web Service** from `frontend/Dockerfile`, passing
   `VITE_API_URL=https://<your-backend-domain>` as a build arg.
4. Update `FRONTEND_ORIGIN` on the backend to your deployed frontend URL (for CORS).

### Option B — Heroku
```bash
# Backend
cd backend
heroku create docsync-api
heroku addons:create heroku-postgresql:essential-0
heroku config:set SECRET_KEY=... JWT_SECRET_KEY=... FRONTEND_ORIGIN=https://your-frontend-url
git subtree push --prefix backend heroku main
```
Heroku sets `DATABASE_URL` automatically when you attach Postgres. Add a
`Procfile` in `backend/` if you don't want to rely on the Dockerfile:
```
web: gunicorn --worker-class eventlet -w 1 app:app
```
For the frontend, either host it on Heroku too (as a static buildpack) or on
Netlify/Vercel pointed at `VITE_API_URL=https://docsync-api.herokuapp.com`.

### Option C — AWS (matches the roadmap's "AWS S3 + Docker" plan)
1. **ECR**: push both images (`docker build` + `docker push`) to two ECR repos.
2. **RDS**: create a Postgres instance; set `DATABASE_URL` accordingly.
3. **ECS Fargate** (or **App Runner** for less config): run the backend
   container, exposing port 5000, with your `.env` values as task-definition
   secrets/env vars.
4. **S3**: create a bucket and set `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` on the backend service — this is
   what the app uses for the "Cloud Storage Integration" feature (export
   files land in S3 instead of local disk automatically).
5. **CloudFront + S3** (or Amplify) to host the built frontend
   (`npm run build` → upload `dist/`), or run the frontend's nginx Docker
   image on Fargate/App Runner as well.
6. Point your domain's DNS / ALB at the two services and update
   `FRONTEND_ORIGIN` / `VITE_API_URL` to match the real domains.

### Important production checklist
- [ ] Replace every default secret in `.env.example` / `docker-compose.yml`
- [ ] Set `FLASK_DEBUG=0`
- [ ] Put the backend behind HTTPS (ALB/nginx + TLS cert, e.g. via Let's Encrypt or ACM)
- [ ] Use a managed Postgres instance rather than SQLite
- [ ] Set a real `ENCRYPTION_KEY` (32+ random bytes) — otherwise content-at-rest
      encryption derives its key from `SECRET_KEY`
- [ ] Configure S3 bucket policies (private bucket + signed URLs, or backend-proxied downloads as implemented)

---

## 5. API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account (first user = admin) |
| POST | `/api/auth/login` | Get JWT |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/documents` | List / create documents |
| GET/PUT/DELETE | `/api/documents/<id>` | Read / update / delete a document |
| GET/POST | `/api/documents/<id>/collaborators` | Manage per-doc roles |
| GET | `/api/documents/<id>/versions` | Version history |
| POST | `/api/documents/<id>/versions/<vid>/restore` | Roll back |
| GET/POST | `/api/documents/<id>/comments` | Inline comments |
| GET | `/api/documents/<id>/export/pdf` \| `/export/docx` | Export |

**WebSocket events** (Socket.IO): `join_document`, `leave_document`,
`content_change` → `content_update`, `chat_message`, `cursor_move`.

---

## 6. Known Limitations / Next Steps

- Real-time editing uses last-write-wins broadcast, not a CRDT — fine for
  small teams, not for high-concurrency simultaneous typing in the same spot.
- No end-to-end encryption in the "only the client can decrypt" sense —
  content is encrypted at rest server-side with a server-held key. True E2EE
  would require client-side key management (out of scope for an MVP).
- No test suite included yet — add `pytest` for the backend and
  `vitest`/`@testing-library/react` for the frontend as a next step.
