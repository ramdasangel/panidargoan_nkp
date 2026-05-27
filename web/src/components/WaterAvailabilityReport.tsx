import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface ReportRow {
  groupId: string;
  groupName: string;
  groupKind: string | null;
  sourceCount: number;
  sourceCountByType: Record<string, number>;
  loggedSourceCount: number;
  totalFlowM3PerDay: number | null;
  avgWaterLevelCm: number | null;
  avgPh: number | null;
  latestObservationAt: string | null;
}

type GroupBy = "taluka" | "watershed";

export function WaterAvailabilityReport({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<GroupBy>("taluka");
  const [rows, setRows]   = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null); setError(null);
    api<ReportRow[]>(`/api/reports/water-availability?groupBy=${groupBy}`)
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [groupBy]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return {
      groupCount: rows.length,
      sources:    rows.reduce((s, r) => s + r.sourceCount, 0),
      logged:     rows.reduce((s, r) => s + r.loggedSourceCount, 0),
      flow:       rows.reduce((s, r) => s + (r.totalFlowM3PerDay ?? 0), 0),
    };
  }, [rows]);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{t("report.waterAvail.title", { defaultValue: "Water availability report" })}</h3>
          <button onClick={onClose} style={styles.close} aria-label="Close">×</button>
        </div>

        <div style={styles.controls}>
          <label style={styles.controlLabel}>
            {t("report.waterAvail.groupBy", { defaultValue: "Group by" })}:
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={styles.select}>
              <option value="taluka">{t("report.waterAvail.byTaluka", { defaultValue: "Taluka" })}</option>
              <option value="watershed">{t("report.waterAvail.byWatershed", { defaultValue: "Watershed" })}</option>
            </select>
          </label>
          {totals && (
            <div style={styles.totals}>
              <span><strong>{totals.groupCount}</strong> {groupBy === "taluka" ? "talukas" : "watersheds"}</span>
              <span> · <strong>{totals.sources}</strong> {t("report.waterAvail.sources", { defaultValue: "sources" })}</span>
              <span> · <strong>{totals.logged}</strong> {t("report.waterAvail.logged", { defaultValue: "logged" })}</span>
              {totals.flow > 0 && <span> · <strong>{totals.flow.toFixed(1)}</strong> m³/day</span>}
            </div>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {!rows && !error && <div style={styles.loading}>…</div>}

        {rows && rows.length === 0 && (
          <div style={styles.empty}>
            {t("report.waterAvail.empty", { defaultValue: "No manual water sources yet. Add some via the map to populate this report." })}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{groupBy === "taluka"
                    ? t("report.waterAvail.taluka", { defaultValue: "Taluka" })
                    : t("report.waterAvail.watershed", { defaultValue: "Watershed" })}</th>
                  <th style={styles.thRight}>{t("report.waterAvail.sourceCount", { defaultValue: "Sources" })}</th>
                  <th style={styles.th}>{t("report.waterAvail.types", { defaultValue: "By type" })}</th>
                  <th style={styles.thRight}>{t("report.waterAvail.logged", { defaultValue: "Logged" })}</th>
                  <th style={styles.thRight}>{t("report.waterAvail.totalFlow", { defaultValue: "Total flow (m³/d)" })}</th>
                  <th style={styles.thRight}>{t("report.waterAvail.avgLevel", { defaultValue: "Avg level (cm)" })}</th>
                  <th style={styles.thRight}>{t("report.waterAvail.avgPh", { defaultValue: "Avg pH" })}</th>
                  <th style={styles.th}>{t("report.waterAvail.lastObs", { defaultValue: "Last observation" })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.groupId}>
                    <td style={styles.td}>
                      <strong>{r.groupName}</strong>
                      {r.groupKind && <span style={styles.kindTag}>{r.groupKind}</span>}
                    </td>
                    <td style={styles.tdRight}>{r.sourceCount}</td>
                    <td style={styles.td}>{formatTypeBreakdown(r.sourceCountByType, t)}</td>
                    <td style={styles.tdRight}>{r.loggedSourceCount}</td>
                    <td style={styles.tdRight}>{r.totalFlowM3PerDay == null ? "—" : r.totalFlowM3PerDay.toFixed(1)}</td>
                    <td style={styles.tdRight}>{r.avgWaterLevelCm == null ? "—" : r.avgWaterLevelCm.toFixed(0)}</td>
                    <td style={styles.tdRight}>{r.avgPh == null ? "—" : r.avgPh.toFixed(2)}</td>
                    <td style={styles.td}>
                      {r.latestObservationAt
                        ? new Date(r.latestObservationAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTypeBreakdown(
  types: Record<string, number>,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  const entries = Object.entries(types ?? {}).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return "—";
  return entries.map(([type, n]) => `${t(`waterSource.type_${type}`, { defaultValue: type })}: ${n}`).join(", ");
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 },
  modal:    { background: "#fff", borderRadius: 6, maxWidth: 1100, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
  header:   { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #eee" },
  title:    { margin: 0, fontSize: 18 },
  close:    { background: "transparent", border: 0, fontSize: 24, cursor: "pointer", color: "#999", padding: 0, width: 32, height: 32, lineHeight: 1 },
  controls: { padding: "12px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  controlLabel: { fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 8 },
  select:   { padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #ccc" },
  totals:   { fontSize: 13, color: "#333" },
  loading:  { padding: 30, textAlign: "center", color: "#999" },
  empty:    { padding: 30, textAlign: "center", color: "#888", fontSize: 14 },
  error:    { padding: 12, background: "#fff3f3", color: "#c62828", margin: 12, borderRadius: 4 },
  tableWrap:{ overflow: "auto" },
  table:    { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:       { textAlign: "left",  padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #e0e0e0", position: "sticky", top: 0, fontWeight: 600 },
  thRight:  { textAlign: "right", padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #e0e0e0", position: "sticky", top: 0, fontWeight: 600 },
  td:       { padding: "8px 12px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" },
  tdRight:  { padding: "8px 12px", borderBottom: "1px solid #f0f0f0", textAlign: "right", verticalAlign: "top" },
  kindTag:  { marginLeft: 8, fontSize: 11, color: "#888", background: "#f5f5f5", padding: "1px 6px", borderRadius: 8 },
};
