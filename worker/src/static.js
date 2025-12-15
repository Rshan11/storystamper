// Embedded static files for single-worker deployment
// These are served directly from the worker without needing external hosting

export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="theme-color" content="#1a202c" />
    <title>StoryStamper</title>
    <link rel="icon" href="favicon.ico" sizes="48x48" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
    <link rel="manifest" href="manifest.json" />
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

        :root {
            --bg-primary: #1a202c;
            --bg-secondary: #151a23;
            --green: #38a169;
            --green-light: #48bb78;
            --red: #e53e3e;
            --text-primary: #f7fafc;
            --text-secondary: #a0aec0;
            --text-muted: #718096;
            --border: #2d3748;
            --border-light: #4a5568;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            min-height: 100vh;
            min-height: 100dvh;
            color: var(--text-primary);
            display: flex;
            flex-direction: column;
        }

        /* Subtle noise texture overlay */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.03;
            pointer-events: none;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E");
        }

        .container {
            flex: 1;
            max-width: 480px;
            margin: 0 auto;
            padding: 40px 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            z-index: 1;
        }

        /* Logo */
        .logo {
            margin-bottom: 24px;
            animation: logoFadeIn 0.8s ease-out;
        }

        .logo svg {
            width: 72px;
            height: 72px;
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
        }

        @keyframes logoFadeIn {
            from {
                opacity: 0;
                transform: scale(0.9) translateY(-10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        /* Brand text */
        .brand {
            text-align: center;
            margin-bottom: 48px;
            animation: fadeIn 0.6s ease-out 0.2s both;
        }

        .brand h1 {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #fff 0%, #e2e8f0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .brand .tagline {
            font-size: 1rem;
            color: var(--text-secondary);
            font-weight: 500;
            letter-spacing: 0.5px;
        }

        .brand .tagline span {
            color: var(--green);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Upload area */
        .upload-area {
            width: 100%;
            border: 2px solid var(--border);
            border-radius: 20px;
            padding: 48px 32px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            background: linear-gradient(180deg, rgba(45, 55, 72, 0.3) 0%, rgba(26, 32, 44, 0.5) 100%);
            position: relative;
            overflow: hidden;
            animation: fadeIn 0.6s ease-out 0.4s both;
        }

        .upload-area::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 18px;
            padding: 2px;
            background: linear-gradient(135deg, transparent 0%, transparent 50%, rgba(56, 161, 105, 0) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .upload-area:hover {
            border-color: var(--green);
            background: linear-gradient(180deg, rgba(56, 161, 105, 0.08) 0%, rgba(26, 32, 44, 0.5) 100%);
            box-shadow: 0 0 40px rgba(56, 161, 105, 0.15), 0 8px 32px rgba(0, 0, 0, 0.3);
            transform: translateY(-2px);
        }

        .upload-area:hover::before {
            opacity: 1;
            background: linear-gradient(135deg, var(--green) 0%, transparent 50%);
        }

        .upload-area.dragover {
            border-color: var(--green-light);
            background: linear-gradient(180deg, rgba(56, 161, 105, 0.15) 0%, rgba(26, 32, 44, 0.5) 100%);
            box-shadow: 0 0 60px rgba(56, 161, 105, 0.25), 0 12px 40px rgba(0, 0, 0, 0.4);
            transform: translateY(-4px) scale(1.02);
        }

        .upload-area input {
            display: none;
        }

        .upload-icon {
            width: 56px;
            height: 56px;
            margin: 0 auto 20px;
            border-radius: 16px;
            background: linear-gradient(135deg, var(--border) 0%, var(--bg-secondary) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }

        .upload-area:hover .upload-icon {
            background: linear-gradient(135deg, var(--green) 0%, #2f855a 100%);
            transform: scale(1.1);
        }

        .upload-icon svg {
            width: 28px;
            height: 28px;
            stroke: var(--text-secondary);
            transition: stroke 0.3s ease;
        }

        .upload-area:hover .upload-icon svg {
            stroke: white;
        }

        .upload-text {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 8px;
        }

        .upload-subtext {
            color: var(--text-muted);
            font-size: 0.875rem;
        }

        /* Loading state */
        .loading {
            display: none;
            text-align: center;
            padding: 60px 20px;
            width: 100%;
        }

        .loading.active {
            display: block;
            animation: fadeIn 0.3s ease-out;
        }

        .spinner {
            width: 48px;
            height: 48px;
            border: 3px solid var(--border);
            border-top-color: var(--green);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 24px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: var(--text-secondary);
            font-weight: 500;
        }

        /* Result state */
        .result {
            display: none;
            width: 100%;
        }

        .result.active {
            display: block;
            animation: fadeIn 0.4s ease-out;
        }

        .result-image-container {
            position: relative;
            margin-bottom: 24px;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .result-image {
            width: 100%;
            display: block;
        }

        .verdict-badge {
            display: inline-block;
            padding: 10px 20px;
            border-radius: 24px;
            font-weight: 600;
            font-size: 0.875rem;
            margin-bottom: 20px;
            letter-spacing: 0.3px;
        }

        .verdict-unverified { background: #d69e2e; color: #1a202c; }
        .verdict-likely-true { background: var(--green); color: #fff; }
        .verdict-verified-true { background: #276749; color: #fff; }
        .verdict-likely-false { background: var(--red); color: #fff; }
        .verdict-verified-false { background: #c53030; color: #fff; }
        .verdict-satire { background: #805ad5; color: #fff; }

        .reasons {
            background: rgba(45, 55, 72, 0.5);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 24px;
        }

        .reasons h3 {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }

        .reasons ul {
            list-style: none;
        }

        .reasons li {
            padding: 10px 0;
            border-bottom: 1px solid var(--border);
            font-size: 0.9rem;
            line-height: 1.5;
            color: var(--text-secondary);
        }

        .reasons li:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .reasons li::before {
            content: '';
            display: inline-block;
            width: 6px;
            height: 6px;
            background: var(--green);
            border-radius: 50%;
            margin-right: 12px;
            vertical-align: middle;
        }

        .actions {
            display: flex;
            gap: 12px;
        }

        .btn {
            flex: 1;
            padding: 16px 24px;
            border: none;
            border-radius: 12px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-primary {
            background: var(--green);
            color: #fff;
        }

        .btn-primary:hover {
            background: var(--green-light);
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(56, 161, 105, 0.3);
        }

        .btn-secondary {
            background: var(--border);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--border-light);
        }

        #stampCanvas {
            display: none;
        }

        /* Error state */
        .error {
            background: rgba(229, 62, 62, 0.1);
            border: 1px solid rgba(229, 62, 62, 0.3);
            border-radius: 12px;
            padding: 16px 20px;
            margin-top: 24px;
            display: none;
            width: 100%;
        }

        .error.active {
            display: block;
            animation: fadeIn 0.3s ease-out;
        }

        .error strong {
            color: #fc8181;
            display: block;
            margin-bottom: 4px;
        }

        .error p {
            color: #feb2b2;
            font-size: 0.875rem;
        }

        /* Footer */
        .footer {
            padding: 24px;
            text-align: center;
            position: relative;
            z-index: 1;
        }

        .beta-badge {
            display: inline-block;
            padding: 6px 12px;
            background: var(--border);
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--text-muted);
            letter-spacing: 1px;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Logo -->
        <div class="logo">
            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#2d3748"/>
                <text x="4" y="23" font-family="Georgia, serif" font-size="18" font-weight="bold" fill="white">S</text>
                <text x="14" y="23" font-family="Georgia, serif" font-size="18" font-weight="bold" fill="white">S</text>
                <g transform="translate(9, 13)">
                    <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="#e53e3e" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="2.5" y1="-2.5" x2="-2.5" y2="2.5" stroke="#e53e3e" stroke-width="2.5" stroke-linecap="round"/>
                </g>
                <g transform="translate(21, 13)">
                    <polyline points="-3,0 -1,3 4,-3" fill="none" stroke="#38a169" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </g>
            </svg>
        </div>

        <!-- Brand -->
        <div class="brand">
            <h1>StoryStamper</h1>
            <p class="tagline">Upload. Verify. <span>Know the truth.</span></p>
        </div>

        <!-- Upload State -->
        <div class="upload-area" id="uploadArea">
            <input type="file" id="fileInput" accept="image/*" />
            <div class="upload-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
            </div>
            <div class="upload-text">Drop a screenshot here</div>
            <div class="upload-subtext">or click to browse</div>
        </div>

        <!-- Loading State -->
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <div class="loading-text">Analyzing sources...</div>
        </div>

        <!-- Result State -->
        <div class="result" id="result">
            <div class="result-image-container">
                <img class="result-image" id="resultImage" src="" alt="Stamped result" />
            </div>

            <div id="verdictBadge" class="verdict-badge"></div>

            <div class="reasons">
                <h3>Analysis</h3>
                <ul id="reasonsList"></ul>
            </div>

            <div class="actions">
                <button class="btn btn-primary" id="saveBtn">Save Image</button>
                <button class="btn btn-secondary" id="newCheckBtn">New Check</button>
            </div>
        </div>

        <!-- Error State -->
        <div class="error" id="error">
            <strong>Something went wrong</strong>
            <p id="errorText"></p>
        </div>
    </div>

    <footer class="footer">
        <span class="beta-badge">Beta</span>
    </footer>

    <canvas id="stampCanvas"></canvas>

    <script>
        const uploadArea = document.getElementById("uploadArea");
        const fileInput = document.getElementById("fileInput");
        const loading = document.getElementById("loading");
        const result = document.getElementById("result");
        const resultImage = document.getElementById("resultImage");
        const verdictBadge = document.getElementById("verdictBadge");
        const reasonsList = document.getElementById("reasonsList");
        const saveBtn = document.getElementById("saveBtn");
        const newCheckBtn = document.getElementById("newCheckBtn");
        const error = document.getElementById("error");
        const errorText = document.getElementById("errorText");
        const canvas = document.getElementById("stampCanvas");
        const ctx = canvas.getContext("2d");

        let currentStampedDataUrl = null;

        uploadArea.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) handleFile(e.target.files[0]);
        });

        uploadArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadArea.classList.add("dragover");
        });

        uploadArea.addEventListener("dragleave", () => {
            uploadArea.classList.remove("dragover");
        });

        uploadArea.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("dragover");
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });

        newCheckBtn.addEventListener("click", () => {
            showUpload();
            fileInput.value = "";
        });

        saveBtn.addEventListener("click", () => {
            if (currentStampedDataUrl) {
                const link = document.createElement("a");
                link.download = "storystamper-" + Date.now() + ".png";
                link.href = currentStampedDataUrl;
                link.click();
            }
        });

        function showUpload() {
            uploadArea.style.display = "block";
            loading.classList.remove("active");
            result.classList.remove("active");
            error.classList.remove("active");
        }

        function showLoading() {
            uploadArea.style.display = "none";
            loading.classList.add("active");
            result.classList.remove("active");
            error.classList.remove("active");
        }

        function showResult() {
            uploadArea.style.display = "none";
            loading.classList.remove("active");
            result.classList.add("active");
            error.classList.remove("active");
        }

        function showError(message) {
            loading.classList.remove("active");
            error.classList.add("active");
            errorText.textContent = message;
        }

        async function compressImage(file) {
            return new Promise((resolve) => {
                const img = new Image();
                const objectUrl = URL.createObjectURL(file);

                img.onload = () => {
                    try {
                        const maxWidth = 1024;
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            height = (height * maxWidth) / width;
                            width = maxWidth;
                        }

                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0, width, height);

                        canvas.toBlob(
                            (blob) => {
                                URL.revokeObjectURL(objectUrl);
                                if (blob) {
                                    resolve(new File([blob], file.name, { type: "image/jpeg" }));
                                } else {
                                    resolve(file);
                                }
                            },
                            "image/jpeg",
                            0.92
                        );
                    } catch (err) {
                        URL.revokeObjectURL(objectUrl);
                        resolve(file);
                    }
                };

                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    resolve(file);
                };

                img.src = objectUrl;
            });
        }

        async function handleFile(file) {
            showLoading();

            try {
                const compressedFile = await compressImage(file);
                const formData = new FormData();
                formData.append("image", compressedFile);

                const response = await fetch("/api/check", {
                    method: "POST",
                    body: formData,
                    credentials: "same-origin",
                });

                if (response.status === 401 || response.status === 302) {
                    window.location.href = "/login";
                    return;
                }

                if (!response.ok) throw new Error("Server error: " + response.status);

                const data = await response.json();
                if (data.error) throw new Error(data.error);

                await generateStampedImage(file, data);
                showResult();
            } catch (err) {
                console.error(err);
                showError(err.message || "Failed to check this screenshot");
            }
        }

        async function generateStampedImage(file, data) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const stampHeight = 160;
                    canvas.width = img.width;
                    canvas.height = img.height + stampHeight;

                    ctx.drawImage(img, 0, 0);
                    ctx.fillStyle = "#1a202c";
                    ctx.fillRect(0, img.height, canvas.width, stampHeight);

                    const verdictColors = {
                        "Verified True": "#276749",
                        "Likely True": "#38a169",
                        Unverified: "#d69e2e",
                        "Likely False": "#e53e3e",
                        "Verified False": "#c53030",
                        Satire: "#805ad5",
                    };

                    const verdictColor = verdictColors[data.verdict] || "#718096";

                    ctx.fillStyle = verdictColor;
                    ctx.font = "bold 24px Georgia, serif";
                    ctx.fillText(data.verdict.toUpperCase(), 16, img.height + 35);

                    ctx.fillStyle = "#a0aec0";
                    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";

                    const reasons = data.reasons || [];
                    reasons.slice(0, 3).forEach((reason, i) => {
                        const truncated = reason.length > 55 ? reason.substring(0, 52) + "..." : reason;
                        ctx.fillText("• " + truncated, 16, img.height + 65 + i * 24);
                    });

                    ctx.fillStyle = "#4a5568";
                    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
                    ctx.fillText("Verified by StoryStamper", 16, img.height + stampHeight - 12);

                    currentStampedDataUrl = canvas.toDataURL("image/png");
                    resultImage.src = currentStampedDataUrl;

                    verdictBadge.textContent = data.verdict;
                    verdictBadge.className = "verdict-badge verdict-" + data.verdict.toLowerCase().replace(/\\s+/g, "-");

                    reasonsList.innerHTML = "";
                    reasons.forEach((reason) => {
                        const li = document.createElement("li");
                        li.textContent = reason;
                        reasonsList.appendChild(li);
                    });

                    resolve();
                };

                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = URL.createObjectURL(file);
            });
        }
    </script>
</body>
</html>`;

export const MANIFEST_JSON = `{
  "name": "StoryStamper",
  "short_name": "StoryStamper",
  "description": "Upload. Verify. Know the truth.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a202c",
  "theme_color": "#1a202c",
  "icons": [
    {
      "src": "icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "icons/icon-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "share_target": {
    "action": "/",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "image",
          "accept": ["image/*"]
        }
      ]
    }
  }
}`;
