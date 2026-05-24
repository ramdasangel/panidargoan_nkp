import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { fmtDate, inr, percent } from "../format";
import type { ProjectDetail as P, TaskGeoLink } from "../types";

interface Props {
  projectId: string;
  onBack: () => void;
}

export function ProjectDetail({ projectId, onBack }: Props) {
  const { t } = useTranslation();
  const [project, setProject] = useState<P | null>(null);

  useEffect(() => {
    setProject(null);
    api<P>(`/api/projects/${projectId}`).then(setProject).catch(console.error);
  }, [projectId]);

  if (!project) return <div style={styles.wrap}>{t("map.loading")}</div>;

  const planned = project.tasks.reduce((s, t) => s + (t.plannedCostInr ?? 0), 0);
  const actual = project.tasks.reduce((s, t) => s + t.actualCostInr, 0);

  return (
    <div style={styles.wrap}>
      <button onClick={onBack} style={styles.back}>← {t("projects.back")}</button>

      <header style={styles.header}>
        <h2 style={styles.h2}>{project.name}</h2>
        <div style={styles.meta}>
          <span><strong>{t("projects.col_code")}:</strong> {project.code}</span>
          <span><strong>{t("projects.col_status")}:</strong> {t(`projects.status_${project.status}`)}</span>
          <span><strong>{t("projects.col_sponsor")}:</strong> {project.sponsor ?? "—"}</span>
          <span><strong>{t("projects.col_dates")}:</strong> {fmtDate(project.startDate)} → {fmtDate(project.endDate)}</span>
        </div>
        {project.description && <p style={styles.desc}>{project.description}</p>}
      </header>

      <section style={styles.summary}>
        <SummaryCard label={t("projects.col_budget")} value={inr(project.budgetInr)} />
        <SummaryCard label={t("projects.col_planned")} value={inr(planned)} subtitle={percent(planned, project.budgetInr ?? 0) + " " + t("projects.ofBudget")} />
        <SummaryCard label={t("projects.col_actual")} value={inr(actual)} subtitle={percent(actual, planned) + " " + t("projects.ofPlanned")} />
        <SummaryCard label={t("projects.tasks")} value={`${project.tasks.length}`} subtitle={`${project.tasks.filter((t) => t.status === "completed").length} ${t("projects.completed")}`} />
      </section>

      <h3 style={styles.h3}>{t("projects.tasks")}</h3>
      <div style={styles.taskList}>
        {project.tasks.map((task) => (
          <article key={task.id} style={styles.task}>
            <div style={styles.taskHead}>
              <div>
                <span style={styles.taskCode}>{task.code}</span>
                <strong style={styles.taskName}>{task.name}</strong>
              </div>
              <span style={{ ...styles.badge, ...taskStatusBadge(task.status) }}>
                {t(`tasks.status_${task.status}`)}
              </span>
            </div>
            <div style={styles.taskRow}>
              <div>
                <div style={styles.kpiLabel}>{t("projects.col_planned")}</div>
                <div style={styles.kpiVal}>{inr(task.plannedCostInr)}</div>
              </div>
              <div>
                <div style={styles.kpiLabel}>{t("projects.col_actual")}</div>
                <div style={styles.kpiVal}>{inr(task.actualCostInr)}</div>
              </div>
              <div>
                <div style={styles.kpiLabel}>{t("projects.col_dates")}</div>
                <div style={styles.kpiValSmall}>{fmtDate(task.startDate)} → {fmtDate(task.endDate)}</div>
              </div>
              <div>
                <div style={styles.kpiLabel}>{t("tasks.geoLinks")}</div>
                <div style={styles.kpiValSmall}>{task.geoLinks.map(geoLinkLabel).join(", ")}</div>
              </div>
            </div>
            {task.allocations.length > 0 && (
              <details style={styles.details}>
                <summary>{t("tasks.allocations")} ({task.allocations.length})</summary>
                <ul style={styles.allocList}>
                  {task.allocations.map((a) => (
                    <li key={a.id}>
                      {a.resource.name} — {a.plannedQuantity} {a.resource.unit} × {inr(a.plannedUnitRateInr)} = <strong>{inr(a.plannedCostInr)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function geoLinkLabel(g: TaskGeoLink): string {
  if (g.village) return `🏘 ${g.village.name}`;
  if (g.waterSource) return `💧 ${g.waterSource.name}`;
  if (g.watershed) return `🌊 ${g.watershed.name}`;
  return g.targetType;
}

function SummaryCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardValue}>{value}</div>
      {subtitle && <div style={styles.cardSubtitle}>{subtitle}</div>}
    </div>
  );
}

function taskStatusBadge(s: string): React.CSSProperties {
  switch (s) {
    case "completed":   return { background: "#e8f5e9", color: "#2e7d32" };
    case "in_progress": return { background: "#e3f2fd", color: "#1565c0" };
    case "blocked":     return { background: "#ffebee", color: "#c62828" };
    case "not_started": return { background: "#f5f5f5", color: "#555" };
    default:            return {};
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 24, overflow: "auto", height: "100%", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, sans-serif" },
  back: { background: "none", border: 0, color: "#1976d2", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12 },
  header: { marginBottom: 16 },
  h2: { fontSize: 20, margin: "0 0 8px" },
  h3: { fontSize: 14, margin: "20px 0 8px", color: "#555" },
  meta: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#444" },
  desc: { fontSize: 13, color: "#555", margin: "8px 0 0", maxWidth: 800 },
  summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 8 },
  card: { background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderRadius: 6, padding: "12px 16px" },
  cardLabel: { fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  cardValue: { fontSize: 22, fontWeight: 600, marginTop: 4, fontVariantNumeric: "tabular-nums" },
  cardSubtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  taskList: { display: "flex", flexDirection: "column", gap: 8 },
  task: { background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderRadius: 6, padding: 12 },
  taskHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  taskCode: { fontSize: 11, color: "#888", marginRight: 8, fontVariantNumeric: "tabular-nums" },
  taskName: { fontSize: 14 },
  taskRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginTop: 8 },
  kpiLabel: { fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiVal: { fontSize: 15, fontWeight: 500, marginTop: 2, fontVariantNumeric: "tabular-nums" },
  kpiValSmall: { fontSize: 12, color: "#444", marginTop: 2 },
  badge: { padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" },
  details: { marginTop: 8, fontSize: 12, color: "#555" },
  allocList: { margin: "4px 0 0 16px", padding: 0 },
};
