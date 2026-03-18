# ⚡ Smart Energy Monitor
## file:///C:/Users/BIKASH/Downloads/smart_energy_dashboard_with_data.html
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
