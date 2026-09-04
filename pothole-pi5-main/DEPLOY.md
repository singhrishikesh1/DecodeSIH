# Deployment Guide

## Option 1: Run Locally (Easiest)

```bash
cd pothole_drone_ai

# Install dependencies
pip install -r requirements-deploy.txt

# Start the server
python web_app.py
```

Open **http://localhost:5000** in your browser. Upload any road photo.

---

## Option 2: Deploy on Render.com (Free, Production-Ready)

Render.com hosts Python web apps for free with automatic HTTPS.

### Steps:

1. **Push your project to GitHub:**
   ```bash
   cd pothole_drone_ai
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/pothole-drone-ai.git
   git push -u origin main
   ```

2. **Go to [render.com](https://render.com) and sign up (free)**

3. **Click "New +" → "Web Service"**

4. **Connect your GitHub repo and configure:**
   - **Name:** pothole-detection
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements-deploy.txt`
   - **Start Command:** `python web_app.py`

5. **Click "Create Web Service"** — Render will build and deploy automatically

6. **Your app will be live at:** `https://pothole-detection.onrender.com`

### Render Free Tier Notes:
- App sleeps after 15 minutes of inactivity (wakes up in ~30 seconds)
- First request after sleep takes longer
- 512 MB RAM, shared CPU (enough for our model)

---

## Option 3: Vercel (Frontend Only)

Vercel is great for static sites. Deploy the frontend, run the backend locally or on Render.

### Steps:

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy the frontend:**
   ```bash
   cd pothole_drone_ai/vercel_deploy
   vercel
   ```

3. **Set the backend URL:**
   - Open your Vercel URL
   - Enter your Render.com URL (or `http://localhost:5000`)
   - Upload images — they'll be sent to your backend for processing

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│   FRONTEND (Vercel) │────▶│  BACKEND (Render.com)    │
│                     │     │                          │
│  - Upload image     │     │  - YOLOv8 inference      │
│  - Show results     │     │  - Pothole measurement   │
│  - Display images   │     │  - Severity classification│
│                     │     │  - Return annotated image │
└─────────────────────┘     └──────────────────────────┘
```

Or simply run everything locally:
```
python web_app.py → http://localhost:5000
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `MODEL_PATH` | auto-detected | Path to model file |

---

## Troubleshooting

### "No model found" error
Run the training pipeline first:
```bash
python -m scripts.test_ml_pipeline
```

### "Cannot connect to backend" on Vercel frontend
- Make sure your Render backend is running
- Enter the correct Render URL in the Backend URL field
- URL format: `https://your-app-name.onrender.com`

### Render deployment fails
- Check build logs on Render dashboard
- Ensure `requirements-deploy.txt` is in the root of your repo
- Ensure the model file is committed to git

### Port already in use
```bash
# Change port
PORT=8080 python web_app.py
```
