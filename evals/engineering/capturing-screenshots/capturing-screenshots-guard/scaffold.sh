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
import SalesDashboard from "./pages/SalesDashboard.jsx";
import SupportDashboard from "./pages/SupportDashboard.jsx";
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

cat >src/pages/SalesDashboard.jsx <<'EOF_8'
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

cat >src/pages/SupportDashboard.jsx <<'EOF_9'
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

mkdir -p screenshots
base64 --decode >screenshots/sales-dashboard.png <<'EOF_13'
iVBORw0KGgoAAAANSUhEUgAAAoAAAAGQCAIAAACxkUZyAAALHUlEQVR42u3Xsa2tMBBFUXfiiMAV
UBBtkVEAhTnEIoWUmGAEo7V0GpjPfd76pbbZzMzMglf8E5iZmQmwmZmZAJuZmZkAm5mZCbCZmZkJ
sJmZmQCbmZmZAJuZmQmwmZmZCbCZmZkAm5mZCbCZmZkJsJmZmQCbmZmZAJuZmQmwmZmZCbCZmZkA
m5mZmQCbmZkJsJmZmQCbmZmZAJuZmQmwmZmZCbCZmZkAm5mZmQCbmZkJsJmZmQmwmZmZAJuZmQmw
mZmZCbCZmZkAm5mZmQCbmZkJsJmZmQmwmZmZAJuZmZkAm5mZCbCZmZkAm5mZWUCAj3FawC4AeBBg
AQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAEWYAAQYAEGQIAFGAABNgEGQIAFGAAB
NgEGQIAFGAABNgEGQIAFGAABFmAAEGABBkCABRgAATYBBkCABRgAATYBBkCABRgAATYBBkCABRgA
ARZgABBgAQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2PzUABFiAARBgAQZAgE2A
ARBgAQZAgE2AARBgAQZAgE2AARBgAQZAgE2AARBgAQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2
AQZAgAUYAAE2AQZAgAUYAAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAE
WIABEGATYAAEWIABEGATYAAEWIABEGATYAAEWIABEGATYAAEWIABEGABBkCATYABEGABBkCATYAB
EGABBkCATYABEGABBkCATYABEGABBkCABRgAAZZGAQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2
AQZAgAUYAAEWYAAQYAEGQIAFGAABNgEGQIAFGAABNgEGQIAFGAABNgEGQIAFmMympX9wvgsIsAAj
wAIMAizAIMCAAAswAizAIMACDAIMAmwCjAALMAiwAIMAgwCbACPAAgwCLMAIsACDAJsAI8ACDAIs
wAiwAIMACzAIMCDAAowACzAIsACDAIMAmwAjwAIMAizAIMAgwCbACLAAgwALMAIswCDAJsAIsACD
AAswAizAIMAmwAgwIMACjAALMAiwAIMAgwCbACPAAgwCLMAgwCDAJsAIsACDAAswCDAIsAkwAizA
IMACjAALMAiwCTACDAiwACPAAgwCLMAgwCDAJsAIsACDAAswCDAIsAkwAizAIMACDAIMAmwCjAAL
MAiwACPAAgwCbAKMAAMCLMAIsACDAAswCDC+rwCbAOOB9kD7vr6vAAsweKDxfQXYBBgPtAfa9/V9
BViAwQPt+/q+AmwCjAfaA+37IsACjAfaA+37+r4CbAKMBxrfFwEWYDzQHmjf1/cVYAEGDzS+rwCb
AOOB9kD7vr6vAAsweKDxfQXYBBgPtAfa9/V9BViAwQPt+/q+AmwCjAfaA+37IsACjAfaA+37+r4C
bAKMBxrfFwEWYDzQHmjf1/cVYAEGDzS+rwCrowDjgfZA+76+rwALMHig8X0F2AQYD7QH2vf1fQVY
gMED7fv6vgJsAowH2gPt+yLAAowH2gPt+/q+AmwCjAca3xcBFmA80B5o39f3FWABBg80vi8CLMB4
oD3Qvq/vK8ACDB5ofF8BNgHGA+2B9n19XwEWYPBA+76+rwCbAOOB9kD7vgiwAOOB9kD7vr6vAJsA
44HG90WABRgPtAfa9/V9BViAwQON74sACzAeaA+07+v7CrAAgwca31eATYDxQHugfV/fV4AFGA+W
e/2efV8BNgH2YAmwB9rvGQEWYATYA+337PsKsAmwB0uA8X0RYAH2YAmwB9rv2fcVYAHGg+VefF8E
WIA9WALsgfZ79n0FWIDxYLkX31eATYA9WALsgfZ79n0FWIDxYLnX79n3FWATYA+WAHug/Z4RYAFG
gD3Qfs++rwCbAHuwBNgD7fsiwALswRJgD7Tfs+8rwAKMB8u9+L4IsAB7sATYA+337PsKsADjwXIv
vq8AmwB7sATYA+337PsKsADjwXKv37PvK8AmwB4sAfZA+z0jwAKMAHug/Z59XwE2AfZgCbAH2vdF
gAXYgyXAHmi/Z99XgE2APVjuxfdFgAXYgyXAHmi/Z99XgAUYD5Z78X0F2ATYgyXAHmi/Z99XgAUY
D5Z7/Z59XwE2AfZgCbAH2u/ZdxFgAcaD5YH2e/Z9BdgE2IMlwO51LwIswALsgXavewVYgE2ABdi9
7nUvAizAAuyBdq97BViABRgPlnvd614BNgEWYA+0e90rwAIswHiw3OteARZgE2AB9kC7170CLMAC
jAfLve4VYAE2ARZgD7R73YsAC7AAe6Dd614BFmATYAH2QLvXvQiwAAuwB9q97hVgARZgPFjuda97
BdgEWIA90O51rwALsADjwXKvewVYgE2ABdgD7V73CrAACzAeLPe6V4AF2ARYgD3Q7nUvAizAAuyB
dq97BViATYAF2APtXvciwAIswB5o97pXgAVYgPFgude97hVgE2AB9kC7170CLMACjAfLve4VYAE2
ARZgD7R73SvAAizAeLDc614BFmATYAH2QLvXvQiwAOOBdq97BViATYAF2APtXvciwAIswB5o97pX
gAVYgPFgude97hVgdRRgAfZAu9e9AizAAowHy73uFWABNgEWYA+0e90rwAIswHiw3OteARZgE2AB
9kC7170IsADjgXavewVYgE2ABdgD7V73IsACLMAeaPe6V4AFWIDxYLnXve5FgAVYgD3Q7nWvAAuw
AOPBcq97BViATYAF2APtXvcKsAALMB4s97pXgAXYBFiAPdDudS8CLMB4oN3rXgEWYBNgAfZAu9e9
CLAAC7AH2r3uFWABFmAE2L3udS8CnD/AHiz3ute9AizAAizAHiz3ute9CLAAe7Dc6173CrAAC7A/
YPe6170CLMAmwB4s97rXvQIswALsD9i97nWvAAuwCbAHy73udS8CLMD+gN3rXvcKsACbAHuw3Ote
9yLAAuzBcq973SvAAizAAuzBcq973YsAC7AHy73uda8AC7AA+wN2r3vd614BNgH2YLnXve4VYAEW
YH/A7nWvewVYgE2APVjuda97EWAB9gfsXve6V4AF2ATYg+Ve97oXARZgD5Z73eteARZgE2APlnvd
614EWIA9WO51r3sFWIAFWIDd6173uleATYA9WO51r3sFWIAF2B+we93rXgEWYBNgD5Z73ete4RRg
AfYH7F73uleABdgE2IPlXve6FwEWYA+We93rXgEWYBNgD5Z73eteBFiAPVjuda97BViABViA3ete
97pXgE2APVjuda97BViABdgfsHvd614BFmATYA+We93rXgEWYAH2B+xe97pXgAXYBNiD5V73uhcB
FmAPlnvd614BFmATYA+We93rXgRYgD1Y7nWvewVYgAVYgN3rXve6V4DtrwFet93MzF5PgAUYAP8D
NgEGQIAFGAABNgEGQIAFGAABNgEGQIAFGAABFmAAEGABBkCABRgAATYBBkCABRgAATYBBkCABRgA
ATYBBkCABRgAARZgABBgAQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUYAAE2AQZAgAUY
AAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAE2AQYAAEWYAAEWIABEGATYAAEWIABEGAT
YAAEWIABEGATYAAEWIABEGATYAAEWIABEGABBkCATYABEGABBkCATYABEGABBkCATYABEGABBkCA
TYABEGABBkCABRgAATYBBkCABRgAATYBBkCABRiAFG4xiVKm0s0HxwAAAABJRU5ErkJggg==
EOF_13

git init -q
git add -A
