import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { fmtDate, inr, percent } from "../format";
import type { ProjectListItem } from "../types";

interface Props {
  onSelect: (id: string) => void;
}

export function ProjectsList({ onSelect }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProjectListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ProjectListItem[]>("/api/projects").then(setItems).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div style={styles.wrap}>{err}</div>;
  if (!items) return <div style={styles.wrap}>{t("map.loading")}</div>;

  return (
    <div style={styles.wrap}>
      <h2 style={styles.h2}>{t("projects.title")}</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>{t("projects.col_code")}</th>
            <th style={styles.th}>{t("projects.col_name")}</th>
            <th style={styles.th}>{t("projects.col_status")}</th>
            <th style={styles.th}>{t("projects.col_sponsor")}</th>
            <th style={styles.thRight}>{t("projects.col_budget")}</th>
            <th style={styles.thRight}>{t("projects.col_planned")}</th>
            <th style={styles.thRight}>{t("projects.col_actual")}</th>
            <th style={styles.thRight}>{t("projects.col_progress")}</th>
            <th style={styles.th}>{t("projects.col_dates")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} style={styles.tr} onClick={() => onSelect(p.id)}>
              <td style={styles.td}>{p.code}</td>
              <td style={styles.td}><strong>{p.name}</strong></td>
              <td style={styles.td}>
                <span style={{ ...styles.badge, ...statusBadge(p.status) }}>
                  {t(`projects.status_${p.status}`)}
                </span>
              </td>
              <td style={styles.td}>{p.sponsor ?? "—"}</td>
              <td style={styles.tdRight}>{inr(p.budgetInr, { compact: true })}</td>
              <td style={styles.tdRight}>{inr(p.plannedTotalInr, { compact: true })}</td>
              <td style={styles.tdRight}>{inr(p.actualTotalInr, { compact: true })}</td>
              <td style={styles.tdRight}>
                {p.tasksDone}/{p.taskCount} · {percent(p.tasksDone, p.taskCount)}
              </td>
              <td style={styles.tdSmall}>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusBadge(s: string): React.CSSProperties {
  switch (s) {
    case "active":    return { background: "#e3f2fd", color: "#1565c0" };
    case "planning":  return { background: "#f3e5f5", color: "#6a1b9a" };
    case "on_hold":   return { background: "#fff3e0", color: "#ef6c00" };
    case "completed": return { background: "#e8f5e9", color: "#2e7d32" };
    case "cancelled": return { background: "#ffebee", color: "#c62828" };
    default:          return {};
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 24, overflow: "auto", height: "100%", boxSizing: "border-box", fontFamily: "system-ui, -apple-system, sans-serif" },
  h2: { fontSize: 18, marginTop: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e0e0e0", background: "#fafafa", fontWeight: 600, color: "#555" },
  thRight: { textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #e0e0e0", background: "#fafafa", fontWeight: 600, color: "#555" },
  tr: { borderBottom: "1px solid #f0f0f0", cursor: "pointer" },
  td: { padding: "10px 12px", verticalAlign: "top" },
  tdRight: { padding: "10px 12px", textAlign: "right", verticalAlign: "top", fontVariantNumeric: "tabular-nums" },
  tdSmall: { padding: "10px 12px", fontSize: 12, color: "#666" },
  badge: { padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500 },
};
