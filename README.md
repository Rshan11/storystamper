# StoryStamper - Setup Guide

## What You Need

1. **Cloudflare account** (you have this)
2. **Google AI API key** for Gemini - https://aistudio.google.com/apikey
3. **R2 bucket** for storing stamped images

---

## Step 1: Get Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the key somewhere safe

---

## Step 2: Create R2 Bucket

1. In Cloudflare dashboard → R2
2. Create bucket named `hoax-stamps`
3. Under bucket settings → Public Access → Enable (so images can be viewed)
4. Copy the public URL (something like `https://pub-xxxxx.r2.dev`)

---

## Step 3: Deploy the Worker

```bash
cd worker

# Install wrangler if needed
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Set your Gemini API key as a secret
wrangler secret put GEMINI_API_KEY
# (paste your key when prompted)

# Update wrangler.toml with your R2 public URL
# Change PUBLIC_URL = "https://your-public-bucket-url.r2.dev"

# Deploy
wrangler deploy
```

Note the worker URL it gives you (something like `https://hoax-checker.your-subdomain.workers.dev`)

---

## Step 4: Deploy the PWA

1. Open `pwa/index.html`
2. Find `const WORKER_URL = ` near the top of the script
3. Replace with your actual worker URL

Then deploy to Cloudflare Pages:

```bash
cd pwa

# Create a new Pages project
wrangler pages project create storystamper

# Deploy
wrangler pages deploy . --project-name=storystamper
```

---

## Step 5: Test It

1. Go to your Pages URL
2. Upload a screenshot of a sketchy social media post
3. Wait for the verdict
4. Save the stamped image

---

## Adding to Home Screen (iOS)

1. Open the site in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. Now it works like an app

---

## Costs

- **Gemini API**: ~$0.001-0.003 per check (basically free for testing)
- **R2**: Free tier covers 10GB storage
- **Workers**: Free tier covers 100k requests/day
- **Pages**: Free

---

## TODO for Later

- [ ] Add QR code to stamp
- [ ] Better stamp design
- [ ] Rate limiting per IP
- [ ] Usage tracking
- [ ] Share directly from result
