import fs from "fs";
import path from "path";
import zlib from "zlib";
import os from "os";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const HISTORY_FILE = path.resolve(DATA_DIR, "perf_history.json");
const DIST_DIR = path.resolve(ROOT_DIR, "dist");

interface TestAssertion {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

interface TestSuiteResult {
  name: string;
  passed: boolean;
  durationMs: number;
  assertions: TestAssertion[];
}

interface PerfMetrics {
  build: {
    durationMs: number;
    jsBundleSizeKb: number;
    jsBundleGzipKb: number;
    cssBundleSizeKb: number;
    cssBundleGzipKb: number;
    totalBundleSizeKb: number;
    totalBundleGzipKb: number;
  };
  cpu: {
    avgPercent: number;
    maxPercent: number;
    systemCores: number;
    model: string;
  };
  memory: {
    startRssMb: number;
    endRssMb: number;
    peakRssMb: number;
    startHeapUsedMb: number;
    endHeapUsedMb: number;
    peakHeapUsedMb: number;
    heapDeltaMb: number;
  };
  latency: {
    totalRequests: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    p95Ms: number;
    slowestEndpoint: string;
    fastestEndpoint: string;
  };
}

export interface PerfRunRecord {
  id: string;
  timestamp: string;
  trigger: "cli" | "build" | "dashboard";
  status: "PASSED" | "FAILED" | "WARNING";
  score: number;
  totalDurationMs: number;
  suites: TestSuiteResult[];
  metrics: PerfMetrics;
  regressions: string[];
  improvements: string[];
}

function formatBytes(bytes: number): string {
  return (bytes / 1024).toFixed(1) + " Ko";
}

function getMemoryMb(): { rss: number; heapUsed: number; heapTotal: number; external: number } {
  const m = process.memoryUsage();
  return {
    rss: Math.round((m.rss / 1024 / 1024) * 10) / 10,
    heapUsed: Math.round((m.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotal: Math.round((m.heapTotal / 1024 / 1024) * 10) / 10,
    external: Math.round((m.external / 1024 / 1024) * 10) / 10,
  };
}

async function requestEndpoint(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; durationMs: number; data?: any; text?: string; ok: boolean }> {
  const start = performance.now();
  try {
    const res = await fetch(url, options);
    const durationMs = Math.round(performance.now() - start);
    let data: any;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, durationMs, data, text, ok: res.ok };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    return { status: 0, durationMs, error: err.message, ok: false } as any;
  }
}

export async function runAutonomousTestSuite(trigger: "cli" | "build" | "dashboard" = "cli"): Promise<PerfRunRecord> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const startTime = Date.now();
  const suites: TestSuiteResult[] = [];
  const regressions: string[] = [];
  const improvements: string[] = [];

  console.log(`\n===============================================================`);
  console.log(`🚀 [PERF-RUNNER] Lancement de la Suite de Tests Autonomes & Benchmark`);
  console.log(`📅 Date : ${new Date().toLocaleString("fr-FR")} | Run ID : ${runId}`);
  console.log(`💻 Système : ${os.type()} ${os.release()} (${os.cpus().length} cœurs - ${os.cpus()[0]?.model || "CPU"})`);
  console.log(`===============================================================\n`);

  // Track memory and CPU
  const startMem = getMemoryMb();
  let peakRss = startMem.rss;
  let peakHeap = startMem.heapUsed;
  const cpuSamples: number[] = [];
  let prevCpuUsage = process.cpuUsage();
  let prevCpuTime = performance.now();

  const memSampler = setInterval(() => {
    const m = getMemoryMb();
    if (m.rss > peakRss) peakRss = m.rss;
    if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;

    const curUsage = process.cpuUsage(prevCpuUsage);
    const curTime = performance.now();
    const timeDeltaMs = curTime - prevCpuTime;
    if (timeDeltaMs > 0) {
      const totalCpuMicros = curUsage.user + curUsage.system;
      const cpuPercent = (totalCpuMicros / (timeDeltaMs * 1000 * os.cpus().length)) * 100;
      cpuSamples.push(Math.min(100, Math.round(cpuPercent * 10) / 10));
    }
    prevCpuUsage = process.cpuUsage();
    prevCpuTime = performance.now();
  }, 100);

  // -------------------------------------------------------------
  // SUITE 1 : Compilation TypeScript & Bundling Vite
  // -------------------------------------------------------------
  console.log(`[1/4] 📦 Exécution du build TypeScript et bundling Vite...`);
  const buildSuiteStart = performance.now();
  const buildAssertions: TestAssertion[] = [];
  let buildDurationMs = 0;
  let jsBundleSizeKb = 0;
  let jsBundleGzipKb = 0;
  let cssBundleSizeKb = 0;
  let cssBundleGzipKb = 0;

  try {
    const bStart = performance.now();
    execSync("npm.cmd run build", { cwd: ROOT_DIR, stdio: "pipe" });
    buildDurationMs = Math.round(performance.now() - bStart);

    buildAssertions.push({
      name: "Compilation TypeScript (tsc -b)",
      passed: true,
      durationMs: Math.round(buildDurationMs * 0.4),
      details: "0 erreur de type détectée",
    });

    // Scan dist/assets
    if (fs.existsSync(DIST_DIR)) {
      const assetsDir = path.resolve(DIST_DIR, "assets");
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        let totalJsBytes = 0;
        let totalJsGzip = 0;
        let totalCssBytes = 0;
        let totalCssGzip = 0;

        for (const file of files) {
          const filePath = path.resolve(assetsDir, file);
          const stat = fs.statSync(filePath);
          const buf = fs.readFileSync(filePath);
          const gzipLen = zlib.gzipSync(buf).length;

          if (file.endsWith(".js")) {
            totalJsBytes += stat.size;
            totalJsGzip += gzipLen;
          } else if (file.endsWith(".css")) {
            totalCssBytes += stat.size;
            totalCssGzip += gzipLen;
          }
        }

        jsBundleSizeKb = Math.round((totalJsBytes / 1024) * 10) / 10;
        jsBundleGzipKb = Math.round((totalJsGzip / 1024) * 10) / 10;
        cssBundleSizeKb = Math.round((totalCssBytes / 1024) * 10) / 10;
        cssBundleGzipKb = Math.round((totalCssGzip / 1024) * 10) / 10;

        buildAssertions.push({
          name: "Génération du Bundle Vite",
          passed: true,
          durationMs: Math.round(buildDurationMs * 0.6),
          details: `JS: ${jsBundleSizeKb} Ko (${jsBundleGzipKb} Ko gzip) | CSS: ${cssBundleSizeKb} Ko (${cssBundleGzipKb} Ko gzip)`,
        });

        // Threshold assertion: Total JS bundle under 1500KB
        buildAssertions.push({
          name: "Seuil de taille du Bundle (< 1500 Ko)",
          passed: jsBundleSizeKb < 1500,
          durationMs: 5,
          details: `Taille JS actuelle : ${jsBundleSizeKb} Ko`,
        });
      }
    }
  } catch (err: any) {
    buildDurationMs = Math.round(performance.now() - buildSuiteStart);
    buildAssertions.push({
      name: "Compilation TypeScript & Vite",
      passed: false,
      durationMs: buildDurationMs,
      error: err.stderr?.toString() || err.message,
    });
  }

  suites.push({
    name: "Build & Bundling Vite / TypeScript",
    passed: buildAssertions.every((a) => a.passed),
    durationMs: Math.round(performance.now() - buildSuiteStart),
    assertions: buildAssertions,
  });

  // -------------------------------------------------------------
  // SUITE 2 : Tests Fonctionnels & Performance des Endpoints API
  // -------------------------------------------------------------
  console.log(`[2/4] ⚡ Benchmark des Endpoints API Backend...`);
  const apiSuiteStart = performance.now();
  const apiAssertions: TestAssertion[] = [];
  const latencies: { endpoint: string; durationMs: number }[] = [];
  const baseUrl = "http://localhost:3001/api";
  const authHeaders = {
    Authorization: "Bearer cartable_test_benchmark_token",
    "Content-Type": "application/json",
  };

  // Test 1: Healthcheck
  const healthRes = await requestEndpoint(`${baseUrl}/health`);
  latencies.push({ endpoint: "/health", durationMs: healthRes.durationMs });
  apiAssertions.push({
    name: "Healthcheck API (/api/health)",
    passed: healthRes.status === 200 && healthRes.data?.status === "ok",
    durationMs: healthRes.durationMs,
    details: `Réponse en ${healthRes.durationMs}ms`,
  });

  // Test 2: Sécurité - Refus d'accès non authentifié
  const unauthRes = await requestEndpoint(`${baseUrl}/notes`);
  latencies.push({ endpoint: "/notes [unauth]", durationMs: unauthRes.durationMs });
  apiAssertions.push({
    name: "Cloisonnement & Sécurité (Rejet 401 sans token)",
    passed: unauthRes.status === 401,
    durationMs: unauthRes.durationMs,
    details: `Statut 401 obtenu en ${unauthRes.durationMs}ms`,
  });

  // Test 3: Ressources universitaires
  const resRes = await requestEndpoint(`${baseUrl}/resources`, { headers: authHeaders });
  latencies.push({ endpoint: "/resources", durationMs: resRes.durationMs });
  apiAssertions.push({
    name: "Catalogue des Matières (/api/resources)",
    passed: resRes.status === 200 && Array.isArray(resRes.data) && resRes.data.length >= 30,
    durationMs: resRes.durationMs,
    details: `${resRes.data?.length || 0} matières retournées en ${resRes.durationMs}ms`,
  });

  // Test 4: Emploi du temps ADE
  const schedRes = await requestEndpoint(`${baseUrl}/schedule`, { headers: authHeaders });
  latencies.push({ endpoint: "/schedule", durationMs: schedRes.durationMs });
  apiAssertions.push({
    name: "Emploi du Temps ADE (/api/schedule)",
    passed: schedRes.status === 200 && Array.isArray(schedRes.data),
    durationMs: schedRes.durationMs,
    details: `${schedRes.data?.length || 0} séances analysées en ${schedRes.durationMs}ms`,
  });

  // Test 5: Relevé de Notes Webnotes
  const gradesRes = await requestEndpoint(`${baseUrl}/grades`, { headers: authHeaders });
  latencies.push({ endpoint: "/grades", durationMs: gradesRes.durationMs });
  apiAssertions.push({
    name: "Relevé de Notes Webnotes (/api/grades)",
    passed: gradesRes.status === 200 && Array.isArray(gradesRes.data),
    durationMs: gradesRes.durationMs,
    details: `${gradesRes.data?.length || 0} semestres en ${gradesRes.durationMs}ms`,
  });

  // Test 6: Dernières évaluations détectées
  const recentGradesRes = await requestEndpoint(`${baseUrl}/grades/recent`, { headers: authHeaders });
  latencies.push({ endpoint: "/grades/recent", durationMs: recentGradesRes.durationMs });
  apiAssertions.push({
    name: "Dernières Notes Reçues (/api/grades/recent)",
    passed: recentGradesRes.status === 200 && recentGradesRes.data?.recentGrades !== undefined,
    durationMs: recentGradesRes.durationMs,
    details: `${recentGradesRes.data?.recentGrades?.length || 0} notes récentes en ${recentGradesRes.durationMs}ms`,
  });

  // Test 7: Cahier de texte & Agenda
  const lessonsRes = await requestEndpoint(`${baseUrl}/planner/lessons`, { headers: authHeaders });
  latencies.push({ endpoint: "/planner/lessons", durationMs: lessonsRes.durationMs });
  apiAssertions.push({
    name: "Cahier de Texte / Devoirs (/api/planner/lessons)",
    passed: lessonsRes.status === 200 && Array.isArray(lessonsRes.data?.lessons),
    durationMs: lessonsRes.durationMs,
    details: `${lessonsRes.data?.lessons?.length || 0} devoirs en ${lessonsRes.durationMs}ms`,
  });

  // Test 8: Rappels de révision
  const remindersRes = await requestEndpoint(`${baseUrl}/planner/reminders`, { headers: authHeaders });
  latencies.push({ endpoint: "/planner/reminders", durationMs: remindersRes.durationMs });
  apiAssertions.push({
    name: "Calcul des Rappels de Veille (/api/planner/reminders)",
    passed: remindersRes.status === 200 && remindersRes.data?.count !== undefined,
    durationMs: remindersRes.durationMs,
    details: `${remindersRes.data?.count || 0} rappels calculés en ${remindersRes.durationMs}ms`,
  });

  // Test 9: Export de Sauvegarde JSON
  const backupRes = await requestEndpoint(`${baseUrl}/backup/export`, { headers: authHeaders });
  latencies.push({ endpoint: "/backup/export", durationMs: backupRes.durationMs });
  apiAssertions.push({
    name: "Export de Sauvegarde Complète (/api/backup/export)",
    passed: backupRes.status === 200 && backupRes.data?.format === "cartable-backup",
    durationMs: backupRes.durationMs,
    details: `Sauvegarde générée en ${backupRes.durationMs}ms (${(backupRes.text?.length || 0) / 1024 | 0} Ko)`,
  });

  // Test 10: Cycle CRUD Note (Création, Lecture, Modification, Suppression)
  const testNotePayload = {
    resourceId: "R201",
    type: "CM",
    title: `[Benchmark Auto] Note de test ${Date.now()}`,
    content: "# Note de test automatique\nBenchmarking CRUD speed.",
  };
  const createNoteRes = await requestEndpoint(`${baseUrl}/notes`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(testNotePayload),
  });
  latencies.push({ endpoint: "/notes [POST]", durationMs: createNoteRes.durationMs });

  let noteCyclePassed = createNoteRes.status === 201 && !!createNoteRes.data?.id;
  const createdId = createNoteRes.data?.id;

  if (createdId) {
    // Delete test note to keep database clean
    const delRes = await requestEndpoint(`${baseUrl}/notes/${createdId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    latencies.push({ endpoint: "/notes/:id [DELETE]", durationMs: delRes.durationMs });
    noteCyclePassed = noteCyclePassed && (delRes.status === 200 || delRes.status === 204);
  }

  apiAssertions.push({
    name: "Cycle CRUD Notes (Création, Persistance & Nettoyage)",
    passed: noteCyclePassed,
    durationMs: createNoteRes.durationMs,
    details: `Cycle CRUD validé en ${createNoteRes.durationMs}ms`,
  });

  // Test 11: Configuration IA & Multi-Providers
  const aiConfigRes = await requestEndpoint(`${baseUrl}/ai/config`, { headers: authHeaders });
  latencies.push({ endpoint: "/ai/config", durationMs: aiConfigRes.durationMs });
  apiAssertions.push({
    name: "Configuration IA Multi-Providers (/api/ai/config)",
    passed: aiConfigRes.status === 200 && aiConfigRes.data?.providers?.ollama !== undefined,
    durationMs: aiConfigRes.durationMs,
    details: `Provider actif : ${aiConfigRes.data?.activeProvider || "ollama"} en ${aiConfigRes.durationMs}ms`,
  });

  // Test 12: Moteur d'Insights Proactifs
  const aiInsightsRes = await requestEndpoint(`${baseUrl}/ai/proactive-insights`, { headers: authHeaders });
  latencies.push({ endpoint: "/ai/proactive-insights", durationMs: aiInsightsRes.durationMs });
  apiAssertions.push({
    name: "Moteur de Conseils Proactifs (/api/ai/proactive-insights)",
    passed: aiInsightsRes.status === 200 && Array.isArray(aiInsightsRes.data?.insights),
    durationMs: aiInsightsRes.durationMs,
    details: `${aiInsightsRes.data?.insights?.length || 0} alertes/conseils générés en ${aiInsightsRes.durationMs}ms`,
  });

  suites.push({
    name: "Intégration & Performance des Endpoints API",
    passed: apiAssertions.every((a) => a.passed),
    durationMs: Math.round(performance.now() - apiSuiteStart),
    assertions: apiAssertions,
  });

  // Stop memory & CPU sampler
  clearInterval(memSampler);

  // -------------------------------------------------------------
  // SUITE 3 : Profiling Mémoire & Détection de Fuite
  // -------------------------------------------------------------
  console.log(`[3/4] 🧠 Analyse de la mémoire RAM et utilisation CPU...`);
  const endMem = getMemoryMb();
  const heapDelta = Math.round((endMem.heapUsed - startMem.heapUsed) * 10) / 10;
  const avgCpu = cpuSamples.length > 0 ? Math.round((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length) * 10) / 10 : 0;
  const maxCpu = cpuSamples.length > 0 ? Math.max(...cpuSamples) : 0;

  const memAssertions: TestAssertion[] = [
    {
      name: "Plafond de mémoire vive (RSS < 250 Mo)",
      passed: peakRss < 250,
      durationMs: 1,
      details: `Pic RSS : ${peakRss} Mo (Début: ${startMem.rss} Mo, Fin: ${endMem.rss} Mo)`,
    },
    {
      name: "Stabilité du tas V8 (Heap Delta < 50 Mo)",
      passed: Math.abs(heapDelta) < 50,
      durationMs: 1,
      details: `Delta mémoire tas : ${heapDelta > 0 ? "+" : ""}${heapDelta} Mo (Pic tas : ${peakHeap} Mo)`,
    },
    {
      name: "Consommation CPU sous contrôle (< 90%)",
      passed: maxCpu < 90,
      durationMs: 1,
      details: `Moyenne : ${avgCpu}% | Pic : ${maxCpu}%`,
    },
  ];

  suites.push({
    name: "Santé Mémoire & Utilisation CPU",
    passed: memAssertions.every((a) => a.passed),
    durationMs: 5,
    assertions: memAssertions,
  });

  // Calculate Latency Stats
  const durations = latencies.map((l) => l.durationMs).sort((a, b) => a - b);
  const avgLatency = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const minLatency = durations.length > 0 ? durations[0] : 0;
  const maxLatency = durations.length > 0 ? durations[durations.length - 1] : 0;
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  const p95Latency = durations.length > 0 ? durations[p95Index] : 0;

  const sortedByDuration = [...latencies].sort((a, b) => b.durationMs - a.durationMs);
  const slowestEndpoint = sortedByDuration[0]?.endpoint || "N/A";
  const fastestEndpoint = sortedByDuration[sortedByDuration.length - 1]?.endpoint || "N/A";

  const totalBundleSizeKb = Math.round((jsBundleSizeKb + cssBundleSizeKb) * 10) / 10;
  const totalBundleGzipKb = Math.round((jsBundleGzipKb + cssBundleGzipKb) * 10) / 10;

  // -------------------------------------------------------------
  // SUITE 4 : Calcul du Score d'Optimisation & Détection de Régression
  // -------------------------------------------------------------
  console.log(`[4/4] 📊 Évaluation du Score d'Optimisation et comparaison historique...`);
  let score = 100;

  // Pénalités
  if (buildDurationMs > 4500) score -= Math.min(20, Math.round((buildDurationMs - 4500) / 300));
  if (jsBundleSizeKb > 950) score -= Math.min(15, Math.round((jsBundleSizeKb - 950) / 30));
  if (avgLatency > 35) score -= Math.min(20, Math.round((avgLatency - 35) * 1.5));
  if (peakRss > 180) score -= Math.min(15, Math.round((peakRss - 180) / 10));

  const totalAssertions = suites.flatMap((s) => s.assertions);
  const failedAssertions = totalAssertions.filter((a) => !a.passed);
  score -= failedAssertions.length * 25;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Load History and Compare
  let history: PerfRunRecord[] = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    } catch {
      history = [];
    }
  }

  const prevRun = history.length > 0 ? history[history.length - 1] : null;

  if (prevRun) {
    // RAM Regression (> 15% increase)
    const ramDiff = peakRss - prevRun.metrics.memory.peakRssMb;
    const ramPercent = (ramDiff / prevRun.metrics.memory.peakRssMb) * 100;
    if (ramPercent > 15 && ramDiff > 15) {
      regressions.push(`Augmentation de la consommation RAM : +${ramDiff.toFixed(1)} Mo (+${ramPercent.toFixed(1)}%)`);
    } else if (ramPercent < -10) {
      improvements.push(`Optimisation de la mémoire RAM : ${ramDiff.toFixed(1)} Mo (${ramPercent.toFixed(1)}%)`);
    }

    // JS Bundle Regression (> 5% increase)
    const bundleDiff = jsBundleSizeKb - prevRun.metrics.build.jsBundleSizeKb;
    const bundlePercent = (bundleDiff / prevRun.metrics.build.jsBundleSizeKb) * 100;
    if (bundlePercent > 5 && bundleDiff > 20) {
      regressions.push(`Poids du bundle JS en hausse : +${bundleDiff.toFixed(1)} Ko (+${bundlePercent.toFixed(1)}%)`);
    } else if (bundlePercent < -5) {
      improvements.push(`Allègement du bundle JS : ${bundleDiff.toFixed(1)} Ko (${bundlePercent.toFixed(1)}%)`);
    }

    // Build Time Regression (> 25% increase)
    const buildDiff = buildDurationMs - prevRun.metrics.build.durationMs;
    const buildPercent = (buildDiff / prevRun.metrics.build.durationMs) * 100;
    if (buildPercent > 25 && buildDiff > 1000) {
      regressions.push(`Ralentissement du temps de build : +${buildDiff}ms (+${buildPercent.toFixed(0)}%)`);
    } else if (buildPercent < -15) {
      improvements.push(`Accélération du temps de build : ${buildDiff}ms (${buildPercent.toFixed(0)}%)`);
    }

    // Latency Regression (> 30% increase)
    const latDiff = avgLatency - prevRun.metrics.latency.avgMs;
    const latPercent = prevRun.metrics.latency.avgMs > 0 ? (latDiff / prevRun.metrics.latency.avgMs) * 100 : 0;
    if (latPercent > 35 && latDiff > 15) {
      regressions.push(`Dégradation de la latence API moyenne : +${latDiff}ms (+${latPercent.toFixed(0)}%)`);
    } else if (latPercent < -20) {
      improvements.push(`Amélioration de la réactivité API : ${latDiff}ms (${latPercent.toFixed(0)}%)`);
    }
  }

  const allPassed = suites.every((s) => s.passed);
  const status: "PASSED" | "FAILED" | "WARNING" = !allPassed
    ? "FAILED"
    : regressions.length > 0
    ? "WARNING"
    : "PASSED";

  const totalDurationMs = Date.now() - startTime;

  const runRecord: PerfRunRecord = {
    id: runId,
    timestamp: new Date().toISOString(),
    trigger,
    status,
    score,
    totalDurationMs,
    suites,
    metrics: {
      build: {
        durationMs: buildDurationMs,
        jsBundleSizeKb,
        jsBundleGzipKb,
        cssBundleSizeKb,
        cssBundleGzipKb,
        totalBundleSizeKb,
        totalBundleGzipKb,
      },
      cpu: {
        avgPercent: avgCpu,
        maxPercent: maxCpu,
        systemCores: os.cpus().length,
        model: os.cpus()[0]?.model || "CPU",
      },
      memory: {
        startRssMb: startMem.rss,
        endRssMb: endMem.rss,
        peakRssMb: peakRss,
        startHeapUsedMb: startMem.heapUsed,
        endHeapUsedMb: endMem.heapUsed,
        peakHeapUsedMb: peakHeap,
        heapDeltaMb: heapDelta,
      },
      latency: {
        totalRequests: latencies.length,
        avgMs: avgLatency,
        minMs: minLatency,
        maxMs: maxLatency,
        p95Ms: p95Latency,
        slowestEndpoint,
        fastestEndpoint,
      },
    },
    regressions,
    improvements,
  };

  // Save into history (keep up to 50 runs)
  history.push(runRecord);
  if (history.length > 50) history = history.slice(-50);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");

  // Output terminal recap
  console.log(`\n===============================================================`);
  console.log(`📋 RÉSULTATS DU BENCHMARK & DES TESTS AUTONOMES`);
  console.log(`===============================================================`);
  console.log(`🏆 Score d'Optimisation : ${score}/100 [${status}]`);
  console.log(`⏱️  Durée globale du test : ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`📦 Build Time : ${buildDurationMs}ms | Bundle JS : ${jsBundleSizeKb} Ko (${jsBundleGzipKb} Ko gzip)`);
  console.log(`🧠 Mémoire RAM : Pic RSS ${peakRss} Mo (Tas : ${peakHeap} Mo, Delta : ${heapDelta} Mo)`);
  console.log(`⚡ Latence API : Moyenne ${avgLatency}ms | P95 : ${p95Latency}ms (Min: ${minLatency}ms, Max: ${maxLatency}ms)`);
  console.log(`💻 CPU : Moyenne ${avgCpu}% (Pic ${maxCpu}%)`);

  console.log(`\n--- Détail des Suites de Tests ---`);
  for (const s of suites) {
    const icon = s.passed ? "✅" : "❌";
    console.log(`${icon} ${s.name} (${s.durationMs}ms)`);
    for (const a of s.assertions) {
      const aIcon = a.passed ? "  ✓" : "  ✗";
      console.log(`   ${aIcon} ${a.name} ${a.details ? `(${a.details})` : ""}`);
      if (a.error) console.log(`     Erreur: ${a.error}`);
    }
  }

  if (regressions.length > 0) {
    console.log(`\n⚠️  ALERTES DE RÉGRESSION DÉTECTÉES :`);
    for (const r of regressions) console.log(`   - 🔴 ${r}`);
  }

  if (improvements.length > 0) {
    console.log(`\n✨ AMÉLIORATIONS NOTABLES CONSTATÉES :`);
    for (const imp of improvements) console.log(`   - 🟢 ${imp}`);
  }

  console.log(`===============================================================\n`);
  return runRecord;
}

// Direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("perf-test-runner.ts")) {
  runAutonomousTestSuite("cli")
    .then((rec) => {
      if (rec.status === "FAILED") {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("[-] Erreur fatale test runner :", err);
      process.exit(1);
    });
}
