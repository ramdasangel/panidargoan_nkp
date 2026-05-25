import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { fmtDate } from "../format";
import type { WaterSourceType } from "../types";

interface MasterRecord {
  id: string;
  code: string;
  name: string;
  type: WaterSourceType;
  watershedId: string | null;
  capacityM3: number | null;
  depthM: number | null;
  condition: string | null;
  notes: string | null;
  kml?: string | null;
}

interface LogRecord {
  id: string;
  loggedAt: string;
  flowM3PerDay: number | null;
  waterLevelCm: number | null;
  phLevel: number | null;
  tdsPpm: number | null;
  turbidityNtu: number | null;
  temperatureC: number | null;
  condition: string | null;
  notes: string | null;
  loggedBy: { id: string; email: string; name: string } | null;
}

interface Props {
  waterSourceId: string;
  onClose: () => void;
  onUpdated: () => void;
}

const blankLog = {
  loggedAt: "",
  flowM3PerDay: "", waterLevelCm: "",
  phLevel: "", tdsPpm: "", turbidityNtu: "", temperatureC: "",
  condition: "", notes: "",
};

export function WaterSourceDetail({ waterSourceId, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const [master, setMaster] = useState<MasterRecord | null>(null);
  const [logs, setLogs] = useState<LogRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "log">("view");
  const [edit, setEdit] = useState<MasterRecord | null>(null);
  const [logDraft, setLogDraft] = useState<typeof blankLog>(blankLog);

  async function refresh() {
    try {
      const [m, l] = await Promise.all([
        api<MasterRecord>(`/api/water-sources/${waterSourceId}`),
        api<LogRecord[]>(`/api/water-sources/${waterSourceId}/logs`),
      ]);
      setMaster(m);
      setLogs(l);
      setEdit(m);
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => { refresh(); }, [waterSourceId]);

  async function saveEdit() {
    if (!edit) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/water-sources/${waterSourceId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: edit.name,
          type: edit.type,
          capacityM3: edit.capacityM3 ?? null,
          depthM: edit.depthM ?? null,
          condition: edit.condition ?? null,
          notes: edit.notes ?? null,
        }),
      });
      setMode("view");
      onUpdated();
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function saveLog() {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = {};
      const numFields = ["flowM3PerDay", "waterLevelCm", "phLevel", "tdsPpm", "turbidityNtu", "temperatureC"] as const;
      for (const k of numFields) {
        const v = logDraft[k];
        if (v !== "" && v !== null) body[k] = Number(v);
      }
      if (logDraft.condition.trim()) body.condition = logDraft.condition.trim();
      if (logDraft.notes.trim())     body.notes     = logDraft.notes.trim();
      if (logDraft.loggedAt)         body.loggedAt  = new Date(logDraft.loggedAt).toISOString();

      await api(`/api/water-sources/${waterSourceId}/logs`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLogDraft(blankLog);
      setMode("view");
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function deleteLog(id: string) {
    if (!confirm(t("wsDetail.confirmDeleteLog"))) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/water-sources/${waterSourceId}/logs/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  if (!master) return <div className="pdg-rollup" style={styles.panel}>{t("map.loading")}</div>;

  return (
    <div className="pdg-rollup" style={styles.panel}>
      <button onClick={onClose} style={styles.close} aria-label="Close">×</button>

      <div style={styles.headerArea}>
        <div style={styles.titleRow}>
          <strong style={styles.title}>{master.name}</strong>
          <span style={styles.typePill}>{t(`waterSource.type_${master.type}`)}</span>
        </div>
        <div style={styles.subtitle}>{master.code}</div>
      </div>

      {/* MASTER section */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <h4 style={styles.h4}>{t("wsDetail.master")}</h4>
          {mode === "view" && (
            <button onClick={() => { setEdit(master); setMode("edit"); }} style={styles.actionBtn} type="button">
              ✎ {t("wsDetail.edit")}
            </button>
          )}
        </div>
        {mode === "edit" && edit ? (
          <div style={styles.formGrid}>
            <Field label={t("addWS.name")}>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={styles.input} />
            </Field>
            <Field label={`${t("waterSource.capacity")} (${t("waterSource.capacityUnit")})`}>
              <input type="number" min="0" value={edit.capacityM3 ?? ""}
                onChange={(e) => setEdit({ ...edit, capacityM3: e.target.value === "" ? null : Number(e.target.value) })}
                style={styles.input} />
            </Field>
            <Field label={`${t("waterSource.depth")} (${t("waterSource.depthUnit")})`}>
              <input type="number" min="0" value={edit.depthM ?? ""}
                onChange={(e) => setEdit({ ...edit, depthM: e.target.value === "" ? null : Number(e.target.value) })}
                style={styles.input} />
            </Field>
            <Field label={t("waterSource.condition")}>
              <input value={edit.condition ?? ""} onChange={(e) => setEdit({ ...edit, condition: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("addWS.notes")} span={2}>
              <textarea rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} style={styles.textarea} />
            </Field>
            <div style={styles.formActions}>
              <button onClick={() => { setMode("view"); setEdit(master); }} disabled={busy} style={styles.cancelBtn} type="button">{t("addWS.cancel")}</button>
              <button onClick={saveEdit} disabled={busy} style={styles.saveBtn} type="button">{busy ? t("addWS.saving") : t("wsDetail.update")}</button>
            </div>
          </div>
        ) : (
          <dl style={styles.dl}>
            <dt style={styles.dt}>{t("waterSource.capacity")}</dt>
            <dd style={styles.dd}>{master.capacityM3 != null ? `${master.capacityM3} ${t("waterSource.capacityUnit")}` : "—"}</dd>
            <dt style={styles.dt}>{t("waterSource.depth")}</dt>
            <dd style={styles.dd}>{master.depthM != null ? `${master.depthM} ${t("waterSource.depthUnit")}` : "—"}</dd>
            <dt style={styles.dt}>{t("waterSource.condition")}</dt>
            <dd style={styles.dd}>{master.condition ?? "—"}</dd>
            {master.notes && (
              <>
                <dt style={styles.dt}>{t("addWS.notes")}</dt>
                <dd style={styles.dd}>{master.notes}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      {/* LOG section */}
      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <h4 style={styles.h4}>{t("wsDetail.logs", { count: logs?.length ?? 0 })}</h4>
          {mode !== "log" && (
            <button onClick={() => setMode("log")} style={styles.actionBtnPrimary} type="button">
              ＋ {t("wsDetail.addLog")}
            </button>
          )}
        </div>

        {mode === "log" && (
          <div style={styles.formGrid}>
            <Field label={t("wsDetail.loggedAt")}>
              <input type="datetime-local" value={logDraft.loggedAt} onChange={(e) => setLogDraft({ ...logDraft, loggedAt: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.flow") + " (m³/day)"}>
              <input type="number" min="0" step="0.01" value={logDraft.flowM3PerDay} onChange={(e) => setLogDraft({ ...logDraft, flowM3PerDay: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.waterLevel") + " (cm)"}>
              <input type="number" step="0.1" value={logDraft.waterLevelCm} onChange={(e) => setLogDraft({ ...logDraft, waterLevelCm: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.ph") + " (0–14)"}>
              <input type="number" min="0" max="14" step="0.1" value={logDraft.phLevel} onChange={(e) => setLogDraft({ ...logDraft, phLevel: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.tds") + " (ppm)"}>
              <input type="number" min="0" step="1" value={logDraft.tdsPpm} onChange={(e) => setLogDraft({ ...logDraft, tdsPpm: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.turbidity") + " (NTU)"}>
              <input type="number" min="0" step="0.1" value={logDraft.turbidityNtu} onChange={(e) => setLogDraft({ ...logDraft, turbidityNtu: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("wsDetail.temperature") + " (°C)"}>
              <input type="number" step="0.1" value={logDraft.temperatureC} onChange={(e) => setLogDraft({ ...logDraft, temperatureC: e.target.value })} style={styles.input} />
            </Field>
            <Field label={t("waterSource.condition")}>
              <input value={logDraft.condition} onChange={(e) => setLogDraft({ ...logDraft, condition: e.target.value })} style={styles.input} placeholder="e.g. perennial / dry" />
            </Field>
            <Field label={t("addWS.notes")} span={2}>
              <textarea rows={2} value={logDraft.notes} onChange={(e) => setLogDraft({ ...logDraft, notes: e.target.value })} style={styles.textarea} />
            </Field>
            <div style={styles.formActions}>
              <button onClick={() => { setMode("view"); setLogDraft(blankLog); }} disabled={busy} style={styles.cancelBtn} type="button">{t("addWS.cancel")}</button>
              <button onClick={saveLog} disabled={busy} style={styles.saveBtn} type="button">{busy ? t("addWS.saving") : t("wsDetail.saveLog")}</button>
            </div>
          </div>
        )}

        {logs && logs.length === 0 && mode !== "log" && (
          <p style={styles.muted}>{t("wsDetail.noLogs")}</p>
        )}

        {logs && logs.length > 0 && (
          <ul style={styles.logList}>
            {logs.map((l) => (
              <li key={l.id} style={styles.logItem}>
                <div style={styles.logHead}>
                  <strong style={styles.logDate}>{fmtDate(l.loggedAt)} {new Date(l.loggedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</strong>
                  <button onClick={() => deleteLog(l.id)} style={styles.logDelBtn} aria-label="Delete log" type="button">✕</button>
                </div>
                <div style={styles.logBy}>{l.loggedBy?.name ?? l.loggedBy?.email ?? "—"}</div>
                <div style={styles.logStats}>
                  {l.flowM3PerDay != null && <Stat label={t("wsDetail.flowShort")} val={`${l.flowM3PerDay} m³/d`} />}
                  {l.waterLevelCm != null && <Stat label={t("wsDetail.levelShort")} val={`${l.waterLevelCm} cm`} />}
                  {l.phLevel != null      && <Stat label="pH"  val={`${l.phLevel}`} warn={l.phLevel < 6.5 || l.phLevel > 8.5} />}
                  {l.tdsPpm != null       && <Stat label="TDS" val={`${l.tdsPpm} ppm`} warn={l.tdsPpm > 500} />}
                  {l.turbidityNtu != null && <Stat label="NTU" val={`${l.turbidityNtu}`} warn={l.turbidityNtu > 5} />}
                  {l.temperatureC != null && <Stat label="T°"  val={`${l.temperatureC}°C`} />}
                  {l.condition            && <Stat label={t("wsDetail.condShort")} val={l.condition} />}
                </div>
                {l.notes && <div style={styles.logNotes}>{l.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, val, warn }: { label: string; val: string; warn?: boolean }) {
  return (
    <span style={{ ...styles.statPill, ...(warn ? styles.statWarn : {}) }}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{val}</strong>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { position: "absolute", top: 12, right: 12, bottom: 12, width: 380, background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.15)", borderRadius: 8, padding: 16, overflowY: "auto", zIndex: 1000, fontSize: 13 },
  close: { position: "absolute", top: 8, right: 12, background: "none", border: 0, fontSize: 22, color: "#888", cursor: "pointer", lineHeight: 1 },
  headerArea: { marginBottom: 12, paddingRight: 24 },
  titleRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  title: { fontSize: 16 },
  typePill: { background: "#e3f2fd", color: "#1565c0", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500 },
  subtitle: { fontSize: 11, color: "#888", marginTop: 2, fontVariantNumeric: "tabular-nums" },
  section: { marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  h4: { margin: 0, fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 },
  actionBtn: { background: "#fff", border: "1px solid #ddd", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#1976d2", fontWeight: 500 },
  actionBtnPrimary: { background: "#1976d2", border: 0, borderRadius: 4, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#fff", fontWeight: 600 },
  dl: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 },
  dt: { color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, alignSelf: "baseline" },
  dd: { margin: 0, fontSize: 13 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  fieldLabel: { display: "block", fontSize: 11, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box" },
  textarea: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" },
  formActions: { gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  cancelBtn: { padding: "6px 12px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  saveBtn: { padding: "6px 12px", background: "#1976d2", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 13 },
  muted: { color: "#999", fontSize: 12 },
  logList: { listStyle: "none", margin: 0, padding: 0 },
  logItem: { padding: "8px 0", borderTop: "1px solid #f4f4f4" },
  logHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  logDate: { fontSize: 12 },
  logDelBtn: { background: "none", border: 0, color: "#bbb", cursor: "pointer", fontSize: 14, padding: 0 },
  logBy: { fontSize: 11, color: "#888", marginTop: 1 },
  logStats: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 },
  statPill: { display: "inline-flex", gap: 4, background: "#f5f5f5", padding: "2px 8px", borderRadius: 10, fontSize: 11, alignItems: "baseline" },
  statWarn: { background: "#fff3e0", color: "#bf6000" },
  statLabel: { color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  logNotes: { marginTop: 4, fontSize: 12, color: "#555", fontStyle: "italic" },
  error: { marginTop: 12, padding: "8px 10px", background: "#ffebee", color: "#c62828", fontSize: 12, borderRadius: 4 },
};
