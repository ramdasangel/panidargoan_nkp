import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { inr } from "../format";
import type { WatershedRollup } from "../types";

interface Props {
  watershedId: string;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

export function CostRollupPanel({ watershedId, onClose, onOpenProject }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<WatershedRollup | null>(null);

  useEffect(() => {
    setData(null);
    api<WatershedRollup>(`/api/reports/watershed/${watershedId}/cost-rollup`)
      .then(setData)
      .catch(console.error);
  }, [watershedId]);

  if (!data) return <div style={styles.panel}>{t("map.loading")}</div>;

  return (
    <div className="pdg-rollup" style={styles.panel}>
      <button onClick={onClose} style={styles.close} aria-label="Close">×</button>
      <div style={styles.heading}>
        <strong>{data.watershed.name}</strong>
        <span style={styles.kind}> · {t(`watershed.kind_${data.watershed.kind}`, { defaultValue: data.watershed.kind })}</span>
      </div>

      <div style={styles.kpis}>
        <Kpi label={t("rollup.planned")} value={inr(data.totalPlannedInr, { compact: true })} />
        <Kpi label={t("rollup.actual")} value={inr(data.totalActualInr, { compact: true })} />
        <Kpi label={t("rollup.tasks")} value={String(data.tasks.length)} />
      </div>

      <h4 style={styles.h4}>{t("rollup.byProject")}</h4>
      {data.projects.length === 0 && <p style={styles.muted}>{t("rollup.empty")}</p>}
      {data.projects.map((p) => (
        <div key={p.id} style={styles.projectRow} onClick={() => onOpenProject(p.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.projName}>{p.name}</div>
            <div style={styles.projMeta}>{p.taskCount} {t("rollup.tasks")} · {inr(p.actualInr, { compact: true })} / {inr(p.plannedInr, { compact: true })}</div>
          </div>
          <span style={styles.linkArrow}>→</span>
        </div>
      ))}

      <h4 style={styles.h4}>{t("rollup.taskList")}</h4>
      <ul style={styles.taskList}>
        {data.tasks.map((task) => (
          <li key={task.taskId} style={styles.taskItem}>
            <div style={styles.taskHead}>
              <span style={styles.taskCode}>{task.taskCode}</span>
              <span style={styles.taskName}>{task.taskName}</span>
            </div>
            <div style={styles.taskMeta}>
              <span style={linkKindBadge(task.linkKind)}>{t(`rollup.link_${task.linkKind}`)}</span>
              <span>{inr(task.actualInr, { compact: true })} / {inr(task.plannedInr, { compact: true })}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiVal}>{value}</div>
    </div>
  );
}

function linkKindBadge(kind: string): React.CSSProperties {
  const base: React.CSSProperties = { padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 500 };
  switch (kind) {
    case "direct_watershed":         return { ...base, background: "#f3e5f5", color: "#6a1b9a" };
    case "water_source_in_subtree":  return { ...base, background: "#e1f5fe", color: "#0277bd" };
    case "village_overlap":          return { ...base, background: "#e8f5e9", color: "#2e7d32" };
    default:                         return base;
  }
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 12, right: 12, bottom: 12,
    width: 360,
    background: "#fff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    borderRadius: 8,
    padding: 16,
    overflowY: "auto",
    zIndex: 999,
    fontSize: 13,
  },
  close: { position: "absolute", top: 8, right: 12, background: "none", border: 0, fontSize: 22, color: "#888", cursor: "pointer", lineHeight: 1 },
  heading: { marginBottom: 12, paddingRight: 24 },
  kind: { color: "#888", fontSize: 12 },
  kpis: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 },
  kpi: { background: "#fafafa", padding: 8, borderRadius: 4, textAlign: "center" },
  kpiLabel: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  kpiVal: { fontSize: 14, fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" },
  h4: { margin: "12px 0 6px", fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 },
  muted: { color: "#888", fontSize: 12 },
  projectRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: "#fafafa", marginBottom: 4 },
  projName: { fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  projMeta: { fontSize: 11, color: "#666", marginTop: 1 },
  linkArrow: { color: "#1976d2", flexShrink: 0 },
  taskList: { listStyle: "none", margin: 0, padding: 0 },
  taskItem: { padding: "6px 0", borderBottom: "1px solid #f0f0f0" },
  taskHead: { display: "flex", gap: 6, alignItems: "baseline" },
  taskCode: { fontSize: 10, color: "#999", fontVariantNumeric: "tabular-nums" },
  taskName: { fontSize: 12 },
  taskMeta: { display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 11, color: "#666" },
};
