#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/components src/pages
cat >package.json <<'EOF_1'
{
  "name": "acme-insights",
  "private": true,
  "version": "0.4.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.8"
  }
}
EOF_1

cat >index.html <<'EOF_2'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acme Insights</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF_2

cat >vite.config.js <<'EOF_3'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
EOF_3

cat >src/main.jsx <<'EOF_4'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
EOF_4

cat >src/App.jsx <<'EOF_5'
import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import Home from "./pages/Home.jsx";
import SalesDashboard from "./pages/Revenue.jsx";
import SupportDashboard from "./pages/Queue.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <div className="shell">
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard/sales" element={<SalesDashboard />} />
          <Route path="/dashboard/support" element={<SupportDashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
EOF_5

cat >src/components/Nav.jsx <<'EOF_6'
import { NavLink } from "react-router-dom";

export default function Nav() {
  return (
    <nav aria-label="Main">
      <NavLink to="/">Acme Insights</NavLink>
      <NavLink to="/dashboard/sales">Sales dashboard</NavLink>
      <NavLink to="/dashboard/support">Support dashboard</NavLink>
      <NavLink to="/settings">Settings</NavLink>
    </nav>
  );
}
EOF_6

cat >src/pages/Home.jsx <<'EOF_7'
export default function Home() {
  return (
    <section>
      <h1>Welcome to Acme Insights</h1>
      <p>Pick a dashboard from the menu.</p>
    </section>
  );
}
EOF_7

cat >src/pages/Revenue.jsx <<'EOF_8'
import { salesByRegion } from "../data.js";

export default function SalesDashboard() {
  return (
    <section>
      <h1>Sales dashboard</h1>
      <table>
        <thead>
          <tr>
            <th>Region</th>
            <th>Orders</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {salesByRegion.map((row) => (
            <tr key={row.region}>
              <td>{row.region}</td>
              <td>{row.orders}</td>
              <td>{row.revenue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
EOF_8

cat >src/pages/Queue.jsx <<'EOF_9'
import { openTickets } from "../data.js";

export default function SupportDashboard() {
  return (
    <section>
      <h1>Support dashboard</h1>
      <ul>
        {openTickets.map((ticket) => (
          <li key={ticket.id}>
            {ticket.id}: {ticket.subject} ({ticket.priority})
          </li>
        ))}
      </ul>
    </section>
  );
}
EOF_9

cat >src/pages/Settings.jsx <<'EOF_10'
export default function Settings() {
  return (
    <section>
      <h1>Settings</h1>
      <label>
        Workspace name <input defaultValue="Acme Corp" />
      </label>
    </section>
  );
}
EOF_10

cat >src/data.js <<'EOF_11'
export const salesByRegion = [
  { region: "North", orders: 412, revenue: "$48,200" },
  { region: "South", orders: 287, revenue: "$31,950" },
  { region: "West", orders: 365, revenue: "$42,775" },
];

export const openTickets = [
  { id: "SUP-101", subject: "Export stuck at 90%", priority: "high" },
  { id: "SUP-102", subject: "Invite email not received", priority: "normal" },
];
EOF_11

cat >src/styles.css <<'EOF_12'
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

.shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 100vh;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: #f3f4f6;
}

@media (prefers-color-scheme: dark) {
  body {
    background: #111827;
    color: #f9fafb;
  }

  nav {
    background: #1f2937;
  }
}
EOF_12

git init -q
git add -A
