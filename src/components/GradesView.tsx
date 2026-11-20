import React, { useState, useMemo, useEffect, useRef } from "react";
import { SemesterReport, Resource, ResourceGrade, GradeEvaluation } from "../types";
import {
  GraduationCap,
  Award,
  TrendingUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ArrowRight,
  Sparkles,
  Layers,
  Calendar,
} from "lucide-react";

interface GradesViewProps {
  grades: SemesterReport[];
  resources: Resource[];
  onOpenResource: (resourceId: string, preferredType?: "CM" | "TP") => void;
  onRefreshGrades?: () => void;
}

export const GradesView: React.FC<GradesViewProps> = ({
  grades,
  resources,
  onOpenResource,
}) => {
  const [selectedSemesterIndex, setSelectedSemesterIndex] = useState<number>(() =>
    Math.max(0, grades.length - 1)
  );
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const hasAutoSelectedRef = useRef<boolean>(grades.length > 0);

  useEffect(() => {
    if (grades.length > 0 && !hasAutoSelectedRef.current) {
      setSelectedSemesterIndex(grades.length - 1);
      hasAutoSelectedRef.current = true;
    }
  }, [grades.length]);

  const currentReport = grades[selectedSemesterIndex] || grades[grades.length - 1] || grades[0];

  const toggleModule = (code: string) => {
    setExpandedModules((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  if (!currentReport) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-500 select-none">
        <GraduationCap className="w-12 h-12 text-slate-400 mb-3" />
        <h3 className="text-base font-bold text-slate-800">Aucun relevé de notes disponible</h3>
      </div>
    );
  }

  const uesList = Object.values(currentReport.ues || {});
  const resList = Object.values(currentReport.ressources || {});
  const saeList = Object.values(currentReport.saes || {});

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 p-3.5 sm:p-5 md:p-8 select-none">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header & Controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl border border-amber-200">
              🎓
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
                Relevé de Notes — Webnotes
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Passerelle Scodoc • Université de Caen Normandie (IUT)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Semester Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              {grades.map((g, idx) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedSemesterIndex(idx)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    selectedSemesterIndex === idx
                      ? "bg-white text-blue-600 border border-slate-200 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {g.titre} ({g.annee})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Global Performance Banner */}
        {(() => {
          const moyNum = Number(currentReport.moyenne_generale);
          const hasMoy = Number.isFinite(moyNum);
          const mentionLabel = !hasMoy
            ? "Notes en cours"
            : moyNum >= 16
            ? "Mention Très Bien • Validé"
            : moyNum >= 14
            ? "Mention Bien • Validé"
            : moyNum >= 12
            ? "Mention Assez Bien • Validé"
            : moyNum >= 10
            ? "Semestre Validé"
            : "En dessous de 10";
          const mentionColor = !hasMoy
            ? "text-slate-500"
            : moyNum >= 10
            ? "text-emerald-600"
            : "text-amber-600";

          const rang = currentReport.rang_general;
          const totalPromo = currentReport.total_promo;
          const hasRang = typeof rang === "number" && rang > 0;
          const topPct = hasRang && totalPromo ? Math.max(1, Math.round((rang / totalPromo) * 100)) : null;

          const ectsAcquis = currentReport.ects_total?.acquis ?? 0;
          const ectsTotal = currentReport.ects_total?.total ?? 0;
          const ectsFull = ectsTotal > 0 && ectsAcquis >= ectsTotal;

          const validatedUes = uesList.filter((ue) => {
            const m = Number(ue.moyenne);
            if (Number.isFinite(m)) return m >= 10;
            const st = String(ue.status || "").toUpperCase();
            return st.includes("ADM") || st.includes("VALID");
          }).length;
          const allUesValidated = uesList.length > 0 && validatedUes === uesList.length;

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <span className="text-xs text-slate-500 font-medium block mb-1">Moyenne Générale</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {currentReport.moyenne_generale ?? "—"}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">/ 20</span>
                </div>
                <span className={`text-[11px] font-semibold mt-1 block ${mentionColor}`}>
                  {mentionLabel}
                </span>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <span className="text-xs text-slate-500 font-medium block mb-1">Rang Promo</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-amber-600">
                    {hasRang ? (
                      <>
                        {rang}
                        <sup className="text-base font-normal">{rang === 1 ? "er" : "e"}</sup>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {totalPromo ? `/ ${totalPromo} étudiants` : ""}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {topPct !== null
                    ? `Top ${topPct}% de la promotion`
                    : totalPromo
                    ? "Rang non publié par Scodoc"
                    : "Données de promo indisponibles"}
                </span>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <span className="text-xs text-slate-500 font-medium block mb-1">Crédits ECTS</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-sky-600">{ectsAcquis}</span>
                  <span className="text-xs text-slate-400 font-mono">/ {ectsTotal} ECTS</span>
                </div>
                <span
                  className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${
                    ectsFull ? "text-emerald-600" : "text-slate-500"
                  }`}
                >
                  {ectsFull && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {ectsFull
                    ? "Semestre 100% Capitalisé"
                    : ectsTotal > 0
                    ? `${Math.round((ectsAcquis / ectsTotal) * 100)}% capitalisé`
                    : "En cours de validation"}
                </span>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <span className="text-xs text-slate-500 font-medium block mb-1">Unités d'Enseignement</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-indigo-600">{validatedUes}</span>
                  <span className="text-xs text-slate-400 font-mono">/ {uesList.length} validées</span>
                </div>
                <span
                  className={`text-[11px] font-semibold mt-1 block ${
                    allUesValidated ? "text-indigo-600" : "text-slate-500"
                  }`}
                >
                  {uesList.length === 0
                    ? "Aucune UE renseignée"
                    : allUesValidated
                    ? "Toutes les compétences acquises"
                    : `${uesList.length - validatedUes} UE en cours`}
                </span>
              </div>
            </div>
          );
        })()}

        {/* UEs Overview Cards */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Synthèse par Unités d'Enseignement (UE)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {uesList.map((ue) => (
              <div
                key={ue.code}
                className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 shadow-sm hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {ue.code}
                    </span>
                    <h4 className="font-bold text-sm text-slate-800 mt-1.5 line-clamp-1">
                      {ue.titre}
                    </h4>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {ue.status || "Validée"}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Moyenne</span>
                    <span className="font-bold text-lg text-slate-900 font-mono">
                      {ue.moyenne} <span className="text-[11px] text-slate-400">/20</span>
                    </span>
                  </div>
                  {ue.rang && (
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">Rang</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {ue.rang} / {ue.total || 54}
                      </span>
                    </div>
                  )}
                  {ue.ects && (
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">ECTS</span>
                      <span className="font-semibold text-sky-600 font-mono">
                        {ue.ects.acquis} / {ue.ects.total}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resources Section with Linked Courses and Evaluations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Notes par Ressources de Cours ({resList.length})
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              Cliquez sur une matière pour déplier ses évaluations
            </span>
          </div>

          <div className="space-y-3">
            {resList.map((mod) => {
              const isExpanded = !!expandedModules[mod.code];
              const linkedResource = resources.find((r) => r.code === mod.code);
              const numMoy = typeof mod.moyenne === "number" ? mod.moyenne : parseFloat(String(mod.moyenne));

              return (
                <div
                  key={mod.code}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-slate-300 transition-all"
                >
                  {/* Module Bar */}
                  <div
                    onClick={() => toggleModule(mod.code)}
                    className="p-3.5 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">
                        {linkedResource?.emoji || "📚"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono text-xs font-bold px-2 py-0.5 rounded border shrink-0"
                            style={{
                              backgroundColor: `${linkedResource?.color || "#3b82f6"}15`,
                              color: linkedResource?.color || "#2563eb",
                              borderColor: `${linkedResource?.color || "#3b82f6"}30`,
                            }}
                          >
                            {mod.code}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {mod.titre}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 mt-1 font-mono flex-wrap">
                          {mod.moy_promo && (
                            <span>Moy. promo : {mod.moy_promo}</span>
                          )}
                          {mod.max_promo && <span>Max : {mod.max_promo}</span>}
                          {mod.min_promo && <span>Min : {mod.min_promo}</span>}
                          {mod.rang && <span>Rang : {mod.rang}e</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-slate-400 block">Note finale</span>
                        <span
                          className={`text-lg sm:text-xl font-bold font-mono ${
                            !isNaN(numMoy) && numMoy >= 14
                              ? "text-emerald-600"
                              : !isNaN(numMoy) && numMoy >= 10
                              ? "text-blue-600"
                              : "text-amber-600"
                          }`}
                        >
                          {mod.moyenne}
                          <span className="text-xs text-slate-400 font-normal"> /20</span>
                        </span>
                      </div>

                      {/* Action to jump to course notes */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenResource(mod.code);
                        }}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 transition-colors shrink-0"
                        title="Ouvrir les notes CM / TP de cette matière"
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>

                      <div className="text-slate-400 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Evaluations */}
                  {isExpanded && (
                    <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase px-1 sm:px-2 mb-1">
                        <span>Évaluations ({mod.evaluations?.length || 0})</span>
                        <div className="grid grid-cols-4 gap-2 sm:gap-6 text-right font-mono text-[10px] sm:text-[11px]">
                          <span>Date</span>
                          <span>Coef</span>
                          <span>Promo</span>
                          <span>Note</span>
                        </div>
                      </div>

                      {mod.evaluations && mod.evaluations.length > 0 ? (
                        mod.evaluations.map((ev) => (
                          <div
                            key={ev.id}
                            className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 sm:gap-4 text-xs"
                          >
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <span className="text-blue-600 font-bold">•</span>
                              <span className="font-semibold text-slate-800 truncate text-xs">
                                {ev.description}
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-2 sm:gap-6 text-right font-mono text-slate-600 shrink-0 text-[11px]">
                              <span className="text-slate-400 text-[10px] sm:text-[11px]">
                                {ev.date || "-"}
                              </span>
                              <span className="text-slate-500">{ev.coef}</span>
                              <span className="text-slate-500 text-[11px]">
                                {ev.moy_promo ? `${ev.moy_promo} moy` : "-"}
                              </span>
                              <span className="font-bold text-slate-900 text-sm">
                                {ev.note}{" "}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  /20
                                </span>
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic p-2">
                          Aucune évaluation individuelle publiée pour ce module.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* SAÉs Section */}
        {saeList.length > 0 && (
          <div className="space-y-4 pt-4">
            <h3 className="text-xs font-semibold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Notes des Projets &amp; SAÉs ({saeList.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {saeList.map((sae) => {
                const linkedResource = resources.find((r) => r.code === sae.code);
                return (
                  <div
                    key={sae.code}
                    className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:border-indigo-200 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">
                        {linkedResource?.emoji || "🚀"}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {sae.code}
                          </span>
                          <h4 className="font-bold text-xs text-slate-800 line-clamp-1">
                            {sae.titre}
                          </h4>
                        </div>
                        {sae.moy_promo && (
                          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                            Moyenne promo : {sae.moy_promo} • Max : {sae.max_promo}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xl font-bold font-mono text-emerald-600">
                        {sae.moyenne}
                        <span className="text-xs text-slate-400 font-normal"> /20</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
