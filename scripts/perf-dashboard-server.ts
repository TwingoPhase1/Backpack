import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runAutonomousTestSuite, PerfRunRecord } from "./perf-test-runner.js";
import { PORT_PERF } from "../server/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const HISTORY_FILE = path.resolve(DATA_DIR, "perf_history.json");

const app = express();
const PORT = PORT_PERF;

app.use(express.json());

function getHistory(): PerfRunRecord[] {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

// API: List of all runs
app.get("/api/perf/history", (req, res) => {
  res.json(getHistory());
});

// API: Latest run
app.get("/api/perf/latest", (req, res) => {
  const history = getHistory();
  if (history.length === 0) return res.status(404).json({ error: "Aucun test enregistré" });
  res.json(history[history.length - 1]);
});

// API: Trigger a new test run
let isRunning = false;
app.post("/api/perf/run", async (req, res) => {
  if (isRunning) {
    return res.status(429).json({ error: "Un test est déjà en cours d'exécution." });
  }

  isRunning = true;
  try {
    const result = await runAutonomousTestSuite("dashboard");
    isRunning = false;
    res.json({ success: true, run: result });
  } catch (err: any) {
    isRunning = false;
    res.status(500).json({ error: err.message || "Échec de l'exécution du test" });
  }
});

// Serve the Interactive HTML Dashboard
app.get("/", (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Observatoire de Performance & Tests — Cartable Numérique</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --primary: #2563eb;
      --primary-light: #eff6ff;
      --success: #16a34a;
      --success-light: #f0fdf4;
      --warning: #d97706;
      --warning-light: #fffbeb;
      --danger: #dc2626;
      --danger-light: #fef2f2;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      padding: 1.5rem;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    
    /* Header */
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .brand { display: flex; align-items: center; gap: 0.85rem; }
    .brand-icon {
      width: 44px; height: 44px;
      background: #2563eb;
      color: white;
      border-radius: 0.75rem;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.35rem;
    }
    .brand-title { font-size: 1.15rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
    .brand-subtitle { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }
    
    .header-actions { display: flex; align-items: center; gap: 0.75rem; }
    .btn {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.65rem 1.15rem;
      font-size: 0.85rem; font-weight: 700;
      border-radius: 0.65rem; border: none;
      cursor: pointer; transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: #2563eb; color: white;
      box-shadow: 0 2px 4px rgba(37,99,235,0.15);
    }
    .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    .btn-outline {
      background: white; color: #475569; border: 1px solid var(--border);
    }
    .btn-outline:hover { background: #f1f5f9; color: #0f172a; }

    /* Alert Banner */
    .alerts-container { margin-bottom: 1.5rem; }
    .alert-card {
      display: flex; align-items: flex-start; gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-radius: 0.85rem;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
      line-height: 1.5;
    }
    .alert-warning {
      background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
    }
    .alert-success {
      background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;
    }
    .alert-danger {
      background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 1.15rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .kpi-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .kpi-val { font-size: 1.65rem; font-weight: 800; color: var(--text-main); margin-top: 0.35rem; display: flex; align-items: baseline; gap: 0.35rem; }
    .kpi-unit { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }
    .kpi-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem; }

    /* Score Badge */
    .score-badge {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0.25rem 0.65rem; border-radius: 9999px;
      font-size: 0.85rem; font-weight: 800; font-family: 'JetBrains Mono', monospace;
    }
    .score-optimal { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .score-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .score-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }

    /* Charts Grid */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 640px) {
      .charts-grid { grid-template-columns: 1fr; }
    }
    .chart-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 1.25rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .chart-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 1rem;
    }
    .chart-title { font-size: 0.95rem; font-weight: 700; color: #0f172a; }
    .chart-desc { font-size: 0.75rem; color: var(--text-muted); }
    .chart-wrapper { position: relative; height: 260px; width: 100%; }

    /* Runs Table */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
      margin-bottom: 2rem;
    }
    .table-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .table-title { font-size: 0.95rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left; }
    th {
      background: #f8fafc;
      color: #475569;
      font-weight: 700;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    
    .status-pill {
      display: inline-flex; align-items: center; gap: 0.35rem;
      padding: 0.2rem 0.5rem; border-radius: 0.4rem;
      font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
    }
    .status-passed { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .status-failed { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .status-warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

    /* Accordion row for tests detail */
    .detail-row { background: #f8fafc; display: none; }
    .detail-box { padding: 1rem 1.5rem; }
    .suite-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem; }
    .suite-card {
      background: white; border: 1px solid var(--border); border-radius: 0.65rem; padding: 0.75rem;
    }
    .suite-title { font-weight: 700; font-size: 0.8rem; margin-bottom: 0.4rem; display: flex; justify-content: space-between; }
    .assertion-item { font-size: 0.75rem; color: #475569; padding: 0.2rem 0; display: flex; align-items: center; gap: 0.35rem; }
    .assertion-item.passed { color: #166534; }
    .assertion-item.failed { color: #991b1b; }

    /* Spin icon animation */
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin 1s linear infinite; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="brand">
        <div class="brand-icon">🎒</div>
        <div>
          <h1 class="brand-title">Observatoire de Performance & Tests Autonomes</h1>
          <p class="brand-subtitle">Cartable Numérique — BUT Réseaux & Télécoms (Campus 3)</p>
        </div>
      </div>

      <div class="header-actions">
        <span id="lastUpdateText" style="font-size: 0.8rem; color: var(--text-muted); font-mono;"></span>
        <button id="runBtn" class="btn btn-primary" onclick="triggerTestRun()">
          <span id="runBtnIcon">⚡</span>
          <span id="runBtnText">Lancer un test maintenant</span>
        </button>
        <a href="http://localhost:5173" target="_blank" class="btn btn-outline" title="Ouvrir Cartable Numérique">
          Ouvrir le site ↗
        </a>
      </div>
    </header>

    <!-- Alerts Container (Regressions or All optimal) -->
    <div id="alertsContainer" class="alerts-container"></div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Score d'Optimisation</div>
        <div class="kpi-val" id="kpiScore">--</div>
        <div class="kpi-sub" id="kpiScoreSub">Sur 100 points de performance</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Mémoire RAM (Pic RSS)</div>
        <div class="kpi-val">
          <span id="kpiRss">--</span>
          <span class="kpi-unit">Mo</span>
        </div>
        <div class="kpi-sub" id="kpiRssSub">Tas V8 : -- Mo</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Temps de Build Total</div>
        <div class="kpi-val">
          <span id="kpiBuild">--</span>
          <span class="kpi-unit">s</span>
        </div>
        <div class="kpi-sub" id="kpiBuildSub">TypeScript + Vite</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Taille Bundle JS</div>
        <div class="kpi-val">
          <span id="kpiBundle">--</span>
          <span class="kpi-unit">Ko</span>
        </div>
        <div class="kpi-sub" id="kpiBundleSub">Gzip : -- Ko</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Latence API Moyenne</div>
        <div class="kpi-val">
          <span id="kpiLatency">--</span>
          <span class="kpi-unit">ms</span>
        </div>
        <div class="kpi-sub" id="kpiLatencySub">P95 : -- ms</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Charge CPU</div>
        <div class="kpi-val">
          <span id="kpiCpu">--</span>
          <span class="kpi-unit">%</span>
        </div>
        <div class="kpi-sub" id="kpiCpuSub">Pic constaté : --%</div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="charts-grid">
      <!-- Chart 1: Memory & CPU -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Consommation RAM & Charge CPU</h3>
            <p class="chart-desc">Évolution du pic RSS, de la mémoire tas et du CPU par run</p>
          </div>
        </div>
        <div class="chart-wrapper">
          <canvas id="chartRamCpu"></canvas>
        </div>
      </div>

      <!-- Chart 2: Build Time & Bundle Size -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Vitesse de Build & Taille des Bundles</h3>
            <p class="chart-desc">Temps de compilation et poids des assets JS/CSS générés</p>
          </div>
        </div>
        <div class="chart-wrapper">
          <canvas id="chartBuildBundle"></canvas>
        </div>
      </div>

      <!-- Chart 3: API Latency -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Réactivité & Latence des Endpoints API</h3>
            <p class="chart-desc">Temps de réponse moyen et percentile 95 sur les routes clés</p>
          </div>
        </div>
        <div class="chart-wrapper">
          <canvas id="chartLatency"></canvas>
        </div>
      </div>

      <!-- Chart 4: Score Trend -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Indice de Santé & Tendance d'Optimisation</h3>
            <p class="chart-desc">Score global sur 100 points comparé entre les builds</p>
          </div>
        </div>
        <div class="chart-wrapper">
          <canvas id="chartScore"></canvas>
        </div>
      </div>
    </div>

    <!-- Historical Runs Table -->
    <div class="table-card">
      <div class="table-header">
        <h3 class="table-title">Historique Chronologique des Tests & Benchmarks</h3>
        <span id="runCountBadge" style="font-size: 0.75rem; background: #e2e8f0; padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: 700;">0 runs</span>
      </div>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Date & Heure</th>
              <th>Statut</th>
              <th>Score</th>
              <th>Durée</th>
              <th>Build</th>
              <th>Bundle JS</th>
              <th>Pic RAM</th>
              <th>Latence</th>
              <th>CPU</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody id="runsTableBody">
            <tr>
              <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">Chargement des données...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let chartRamCpuInstance = null;
    let chartBuildBundleInstance = null;
    let chartLatencyInstance = null;
    let chartScoreInstance = null;

    async function loadData() {
      try {
        const res = await fetch('/api/perf/history');
        const history = await res.json();
        if (!Array.isArray(history) || history.length === 0) {
          document.getElementById('runsTableBody').innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 2rem;">Aucun test enregistré. Cliquez sur "Lancer un test maintenant".</td></tr>';
          return;
        }

        const latest = history[history.length - 1];
        renderKPIs(latest);
        renderAlerts(latest);
        renderCharts(history);
        renderTable(history);

        const date = new Date(latest.timestamp);
        document.getElementById('lastUpdateText').innerText = 'Dernier test : ' + date.toLocaleTimeString('fr-FR');
      } catch (err) {
        console.error('Erreur chargement données', err);
      }
    }

    function renderKPIs(latest) {
      const scoreEl = document.getElementById('kpiScore');
      let badgeClass = 'score-optimal';
      if (latest.score < 70) badgeClass = 'score-danger';
      else if (latest.score < 85) badgeClass = 'score-warning';

      scoreEl.innerHTML = '<span class="score-badge ' + badgeClass + '">' + latest.score + ' / 100</span>';
      document.getElementById('kpiScoreSub').innerText = 'Statut : ' + latest.status + ' (' + latest.suites.length + ' suites)';

      document.getElementById('kpiRss').innerText = latest.metrics.memory.peakRssMb;
      document.getElementById('kpiRssSub').innerText = 'Tas V8 : ' + latest.metrics.memory.peakHeapUsedMb + ' Mo (Delta : ' + (latest.metrics.memory.heapDeltaMb > 0 ? '+' : '') + latest.metrics.memory.heapDeltaMb + ' Mo)';

      document.getElementById('kpiBuild').innerText = (latest.metrics.build.durationMs / 1000).toFixed(2);
      document.getElementById('kpiBuildSub').innerText = 'TS + Vite (' + latest.metrics.build.durationMs + 'ms)';

      document.getElementById('kpiBundle').innerText = latest.metrics.build.jsBundleSizeKb;
      document.getElementById('kpiBundleSub').innerText = 'Gzip : ' + latest.metrics.build.jsBundleGzipKb + ' Ko | CSS : ' + latest.metrics.build.cssBundleSizeKb + ' Ko';

      document.getElementById('kpiLatency').innerText = latest.metrics.latency.avgMs;
      document.getElementById('kpiLatencySub').innerText = 'P95 : ' + latest.metrics.latency.p95Ms + ' ms (Min: ' + latest.metrics.latency.minMs + 'ms)';

      document.getElementById('kpiCpu').innerText = latest.metrics.cpu.avgPercent;
      document.getElementById('kpiCpuSub').innerText = 'Pic : ' + latest.metrics.cpu.maxPercent + '% (' + latest.metrics.cpu.systemCores + ' cœurs)';
    }

    function renderAlerts(latest) {
      const c = document.getElementById('alertsContainer');
      let html = '';

      if (latest.regressions && latest.regressions.length > 0) {
        html += '<div class="alert-card alert-warning">';
        html += '<span style="font-size: 1.25rem;">⚠️</span>';
        html += '<div><strong>Attention : Perte d\\'optimisation détectée vs le run précédent :</strong><ul style="margin-top: 0.35rem; padding-left: 1.2rem;">';
        for (const reg of latest.regressions) {
          html += '<li>' + reg + '</li>';
        }
        html += '</ul></div></div>';
      }

      if (latest.improvements && latest.improvements.length > 0) {
        html += '<div class="alert-card alert-success">';
        html += '<span style="font-size: 1.25rem;">✨</span>';
        html += '<div><strong>Gains de performance constatés :</strong><ul style="margin-top: 0.35rem; padding-left: 1.2rem;">';
        for (const imp of latest.improvements) {
          html += '<li>' + imp + '</li>';
        }
        html += '</ul></div></div>';
      }

      if (!latest.regressions || latest.regressions.length === 0) {
        html += '<div class="alert-card alert-success">';
        html += '<span style="font-size: 1.25rem;">✅</span>';
        html += '<div><strong>Excellente santé des performances !</strong> Aucun ralentissement ni régression mémoire/latence détectée sur ce build.</div></div>';
      }

      c.innerHTML = html;
    }

    function renderCharts(history) {
      const labels = history.map((h, i) => {
        const d = new Date(h.timestamp);
        return '#' + (i + 1) + ' (' + d.getHours() + 'h' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ')';
      });

      // Chart 1: RAM & CPU
      const ramData = history.map(h => h.metrics.memory.peakRssMb);
      const heapData = history.map(h => h.metrics.memory.peakHeapUsedMb);
      const cpuData = history.map(h => h.metrics.cpu.maxPercent);

      if (chartRamCpuInstance) chartRamCpuInstance.destroy();
      chartRamCpuInstance = new Chart(document.getElementById('chartRamCpu'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Pic RAM RSS (Mo)', data: ramData, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true, tension: 0.3, yAxisID: 'y' },
            { label: 'Tas V8 Heap (Mo)', data: heapData, borderColor: '#7c3aed', borderDash: [4, 4], tension: 0.3, yAxisID: 'y' },
            { label: 'Pic CPU (%)', data: cpuData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.2)', type: 'bar', yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { title: { display: true, text: 'Mémoire (Mo)' }, beginAtZero: false },
            y1: { title: { display: true, text: 'CPU (%)' }, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } }
          }
        }
      });

      // Chart 2: Build & Bundle
      const buildData = history.map(h => Math.round(h.metrics.build.durationMs / 100) / 10);
      const jsBundleData = history.map(h => h.metrics.build.jsBundleSizeKb);
      const jsGzipData = history.map(h => h.metrics.build.jsBundleGzipKb);

      if (chartBuildBundleInstance) chartBuildBundleInstance.destroy();
      chartBuildBundleInstance = new Chart(document.getElementById('chartBuildBundle'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: 'Bundle JS Brut (Ko)', data: jsBundleData, backgroundColor: '#3b82f6', yAxisID: 'y' },
            { label: 'Bundle JS Gzip (Ko)', data: jsGzipData, backgroundColor: '#93c5fd', yAxisID: 'y' },
            { label: 'Temps Build (s)', data: buildData, type: 'line', borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.2, yAxisID: 'y1' }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { title: { display: true, text: 'Poids Bundle (Ko)' }, beginAtZero: false },
            y1: { title: { display: true, text: 'Temps Build (s)' }, position: 'right', grid: { drawOnChartArea: false } }
          }
        }
      });

      // Chart 3: Latency
      const avgLat = history.map(h => h.metrics.latency.avgMs);
      const p95Lat = history.map(h => h.metrics.latency.p95Ms);

      if (chartLatencyInstance) chartLatencyInstance.destroy();
      chartLatencyInstance = new Chart(document.getElementById('chartLatency'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Latence Moyenne (ms)', data: avgLat, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 },
            { label: 'Percentile 95 P95 (ms)', data: p95Lat, borderColor: '#065f46', tension: 0.3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { title: { display: true, text: 'Temps de réponse (ms)' }, beginAtZero: true }
          }
        }
      });

      // Chart 4: Optimization Score
      const scores = history.map(h => h.score);
      if (chartScoreInstance) chartScoreInstance.destroy();
      chartScoreInstance = new Chart(document.getElementById('chartScore'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Score de Performance',
              data: scores,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37,99,235,0.15)',
              pointBackgroundColor: scores.map(s => s >= 85 ? '#16a34a' : s >= 70 ? '#d97706' : '#dc2626'),
              pointRadius: 6,
              fill: true,
              tension: 0.2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 100, title: { display: true, text: 'Score / 100' } }
          }
        }
      });
    }

    function renderTable(history) {
      document.getElementById('runCountBadge').innerText = history.length + ' test' + (history.length > 1 ? 's' : '');
      const tbody = document.getElementById('runsTableBody');
      const reversed = [...history].reverse();

      let html = '';
      reversed.forEach((run, idx) => {
        const d = new Date(run.timestamp);
        const dateFormatted = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR');
        const statusClass = run.status === 'PASSED' ? 'status-passed' : run.status === 'WARNING' ? 'status-warning' : 'status-failed';
        const rowId = 'run-detail-' + idx;

        html += '<tr>';
        html += '<td class="mono"><strong>' + dateFormatted + '</strong></td>';
        html += '<td><span class="status-pill ' + statusClass + '">' + run.status + '</span></td>';
        html += '<td><strong>' + run.score + '/100</strong></td>';
        html += '<td>' + (run.totalDurationMs / 1000).toFixed(1) + 's</td>';
        html += '<td>' + run.metrics.build.durationMs + 'ms</td>';
        html += '<td>' + run.metrics.build.jsBundleSizeKb + ' Ko <span style="font-size:0.75rem; color:#94a3b8">(' + run.metrics.build.jsBundleGzipKb + ' gz)</span></td>';
        html += '<td>' + run.metrics.memory.peakRssMb + ' Mo</td>';
        html += '<td>' + run.metrics.latency.avgMs + 'ms <span style="font-size:0.75rem; color:#94a3b8">(P95: ' + run.metrics.latency.p95Ms + ')</span></td>';
        html += '<td>' + run.metrics.cpu.avgPercent + '%</td>';
        html += '<td><button class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.72rem;" onclick="toggleDetail(\\\'' + rowId + '\\\')">Détails ▾</button></td>';
        html += '</tr>';

        // Accordion Details Row
        html += '<tr id="' + rowId + '" class="detail-row"><td colspan="10"><div class="detail-box">';
        html += '<div class="suite-list">';
        run.suites.forEach(suite => {
          html += '<div class="suite-card">';
          html += '<div class="suite-title"><span>' + (suite.passed ? '✅' : '❌') + ' ' + suite.name + '</span><span style="color:#94a3b8">' + suite.durationMs + 'ms</span></div>';
          suite.assertions.forEach(a => {
            const cls = a.passed ? 'passed' : 'failed';
            const icon = a.passed ? '✓' : '✗';
            html += '<div class="assertion-item ' + cls + '"><span>' + icon + ' ' + a.name + '</span> <span style="color:#64748b; font-size:0.7rem;">' + (a.details || '') + '</span></div>';
          });
          html += '</div>';
        });
        html += '</div></div></td></tr>';
      });

      tbody.innerHTML = html;
    }

    function toggleDetail(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = (el.style.display === 'table-row') ? 'none' : 'table-row';
    }

    async function triggerTestRun() {
      const btn = document.getElementById('runBtn');
      const icon = document.getElementById('runBtnIcon');
      const text = document.getElementById('runBtnText');

      btn.disabled = true;
      icon.className = 'spinning';
      icon.innerText = '⚙️';
      text.innerText = 'Test en cours (build & benchmark)...';

      try {
        const res = await fetch('/api/perf/run', { method: 'POST' });
        const data = await res.json();
        if (data.error) {
          alert('Erreur : ' + data.error);
        } else {
          await loadData();
        }
      } catch (err) {
        alert('Erreur de communication : ' + err.message);
      } finally {
        btn.disabled = false;
        icon.className = '';
        icon.innerText = '⚡';
        text.innerText = 'Lancer un test maintenant';
      }
    }

    // Initial load
    loadData();
    // Refresh data every 30s
    setInterval(loadData, 30000);
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`\n📊 [PERF-DASHBOARD] Tableau de bord de performance actif sur http://localhost:${PORT}`);
  console.log(`👉 Ouvrez http://localhost:${PORT} dans votre navigateur pour suivre les tests & métriques.\n`);
});
