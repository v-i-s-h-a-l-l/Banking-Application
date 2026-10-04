# 🚀 Deployment Guide: Frontend (Vercel) + Backend (Render)

This platform is configured for zero-friction cloud deployment:
- **Frontend SPA**: [Vercel](https://vercel.com/)
- **Backend API & Database**: [Render](https://render.com/)

---

## 🌐 1. Deploy Frontend to Vercel

The frontend is a Vite + React 18 Single-Page Application located in `apps/frontend`.

### Option A: Via Vercel Web Dashboard (Recommended)

1. **Log in** to your [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..."** $\rightarrow$ **"Project"**.
2. **Import** your GitHub repository (`Banking-Application`).
3. In the project configuration modal:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `apps/frontend`
   - **Build Command**: `npm run build` (or leave default `vite build`)
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. In **Environment Variables**, add:
   ```env
   VITE_API_URL = https://your-backend-service.onrender.com
   ```
   *(Note: Set this to your Render API Gateway URL after deploying the backend below)*
5. Click **"Deploy"**.

### Option B: Via Vercel CLI

```bash
cd apps/frontend
npx vercel --prod
```

### ✅ Automatic SPA Routing Support
`apps/frontend/vercel.json` and root `vercel.json` are pre-configured with client-side rewrites:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
Refreshing on routes like `/dashboard`, `/transfer`, `/rd`, or `/transactions` will never return 404.

---

## 🖥️ 2. Deploy Backend to Render

Render offers two deployment options:

---

### Option A: 1-Click Render Blueprint (Automated Infrastructure)

This uses the included [`render.yaml`](file:///c:/Banking-platform/render.yaml) file to automatically provision a free PostgreSQL database and the unified backend service.

1. Push your repository to GitHub.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **"New +"** $\rightarrow$ **"Blueprint"**.
4. Connect your GitHub repository.
5. Render reads `render.yaml` and will provision:
   - **`banking-db`**: PostgreSQL Database (Free Tier)
   - **`banking-api-backend`**: Web Service running the API Gateway and internal microservices.
6. Click **"Apply"** and wait for the build to complete.
7. Copy the public Web Service URL (e.g. `https://banking-api-backend.onrender.com`).
8. Paste that URL as `VITE_API_URL` in your Vercel frontend settings!

---

### Option B: Manual Web Service + PostgreSQL on Render

If you prefer setting up manually without Blueprints:

#### Step 1: Create PostgreSQL Database on Render
1. In Render Dashboard, click **"New +"** $\rightarrow$ **"PostgreSQL"**.
2. Name: `banking-db`
3. Database: `banking_platform`
4. User: `banking`
5. Plan: **Free**
6. Click **"Create Database"**.
7. Once created, copy the **Internal Database URL** (or External if deploying outside Render).

#### Step 2: Create Web Service on Render
1. In Render Dashboard, click **"New +"** $\rightarrow$ **"Web Service"**.
2. Connect your repository.
3. Configure the service:
   - **Name**: `banking-api-backend`
   - **Language / Runtime**: `Node`
   - **Region**: Same as database (e.g. Oregon or Frankfurt)
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     npm install && npm run db:generate && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Plan**: **Free**
4. Configure **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Production mode |
   | `DATABASE_URL` | *Paste your Render PostgreSQL connection string* | Required |
   | `JWT_SECRET` | *32+ character random string* | Auth signing |
   | `JWT_REFRESH_SECRET` | *32+ character random string* | Token refresh |
   | `INTERNAL_SERVICE_SECRET` | *random secret* | Internal auth |
   | `CORS_ORIGIN` | `*` or your Vercel URL `https://your-app.vercel.app` | Cross-origin access |
5. Click **"Create Web Service"**.
6. The `scripts/start-render.js` orchestrator will automatically:
   - Execute `prisma migrate deploy` to initialize all database tables.
   - Start the internal Auth, Account, and Transfer services on internal ports.
   - Bind the Fastify API Gateway to Render's public `$PORT`.
   - Expose the `/health` endpoint for Render uptime monitoring.

---

## 🔄 3. Connecting Frontend and Backend

Once both are deployed:

1. Copy your Render backend URL:
   `https://banking-api-backend.onrender.com`
2. Go to **Vercel** $\rightarrow$ **Project Settings** $\rightarrow$ **Environment Variables**.
3. Set:
   ```env
   VITE_API_URL=https://banking-api-backend.onrender.com
   ```
4. Trigger a **Redeploy** on Vercel so the frontend picks up the new environment variable.
5. Open your Vercel URL in your browser:
   - Register a new user (`POST /auth/register`)
   - Create accounts, book Recurring Deposits, book Fixed Deposits, and send transfers!

---

## 🛠️ 4. Local Testing & Verification

Before pushing to git, you can verify both builds locally:

```bash
# 1. Verify Prisma generation and monorepo build
npm run db:generate
npm run build

# 2. Test the frontend production preview
cd apps/frontend
npm run preview
```
