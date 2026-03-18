# ⚡ Smart Energy Monitor
## img <img width="1920" height="1080" alt="Screenshot 2026-03-18 234613" src="https://github.com/user-attachments/assets/b95b275b-2eaa-4a08-9a63-737ca2089016" />

--
## Folder Structure
```
smart-energy-monitor/
├── backend/
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── alerts.js
│   │   ├── auth.js
│   │   └── energy.js
│   ├── utils/
│   │   └── notifications.js
│   ├── .env              ← fill in your values
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   └── LoginPage.jsx
│   │   ├── App.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env              ← already set
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── firmware/
    └── energy_monitor.ino
```

## How to Run

### Terminal 1 — Backend
```
cd backend
npm install
npm run dev
```
Wait for: 🚀 Server running on port 4000

### Terminal 2 — Frontend
```
cd frontend
npm install
npm run dev
```
Wait for: ➜ Local: http://localhost:5173/

Open Chrome → http://localhost:5173
