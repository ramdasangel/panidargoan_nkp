import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { inr } from "../format";
import type { MapLayers, WatershedCostSummary, WatershedNode } from "../types";

interface Props {
  selectedId: string | null;
  onSelect: (node: WatershedNode | null) => void;
  open: boolean;
  onToggle: () => void;
  isMobile: boolean;
  layers: MapLayers;
  onLayersChange: (next: MapLayers) => void;
  onOpenAddWaterSource: () => void;
  addModeActive: boolean;
  isAdmin: boolean;
  onOpenUserManagement: () => void;
}

export function Sidebar(props: Props) {
  const {
    selectedId, onSelect, open, onToggle, isMobile,
    layers, onLayersChange, onOpenAddWaterSource, addModeActive,
    isAdmin, onOpenUserManagement,
  } = props;
  const { t } = useTranslation();
  const [tree, setTree] = useState<WatershedNode[] | null>(null);
  const [summaries, setSummaries] = useState<WatershedCostSummary[]>([]);
  const [layersOpen, setLayersOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [watershedsOpen, setWatershedsOpen] = useState(true);

  useEffect(() => {
    api<WatershedNode[]>("/api/watersheds/tree").then(setTree).catch(console.error);
    api<WatershedCostSummary[]>("/api/reports/watersheds/cost-summary")
      .then(setSummaries)
      .catch(console.error);
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, WatershedCostSummary>();
    for (const s of summaries) m.set(s.watershedId, s);
    return m;
  }, [summaries]);

  const overlays: Array<[keyof MapLayers, string]> = [
    ["talukas", t("map.layerTalukas")],
    ["watersheds", t("map.layerWatersheds")],
    ["waterSourcesManual", t("map.layerWaterSourcesManual")],
    ["waterSourcesBhuvan", t("map.layerWaterSourcesBhuvan")],
  ];

  const classes = ["pdg-sidebar", open ? "open" : "folded"].join(" ");

  return (
    <>
      <aside className={classes}>
        <div className="pdg-sidebar-header">
          <strong>{t("sidebar.menu")}</strong>
          {isMobile && (
            <button onClick={onToggle} className="pdg-sidebar-close" aria-label="Close">×</button>
          )}
        </div>

        {/* LAYERS */}
        <Section
          title={t("map.layers")}
          open={layersOpen}
          onToggle={() => setLayersOpen((o) => !o)}
        >
          {overlays.map(([key, label]) => (
            <label key={key} className="pdg-menu-row">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => onLayersChange({ ...layers, [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="pdg-menu-divider" />
          <div className="pdg-section-sublabel">{t("map.basemap")}</div>
          <label className="pdg-menu-row">
            <input
              type="checkbox"
              checked={layers.bhuvanWaterbodies}
              onChange={(e) => onLayersChange({ ...layers, bhuvanWaterbodies: e.target.checked })}
            />
            <span>{t("map.layerBhuvanWaterbodies")}</span>
          </label>
          <label className="pdg-menu-row">
            <input
              type="checkbox"
              checked={layers.bhuvanWatersheds}
              onChange={(e) => onLayersChange({ ...layers, bhuvanWatersheds: e.target.checked })}
            />
            <span>{t("map.layerBhuvanWatersheds")}</span>
          </label>
          <label className="pdg-menu-row">
            <input
              type="checkbox"
              checked={layers.bhuvanSubbasins}
              onChange={(e) => onLayersChange({ ...layers, bhuvanSubbasins: e.target.checked })}
            />
            <span>{t("map.layerBhuvanSubbasins")}</span>
          </label>
        </Section>

        {/* ACTIONS */}
        <Section
          title={t("sidebar.actions")}
          open={actionsOpen}
          onToggle={() => setActionsOpen((o) => !o)}
        >
          <button
            className="pdg-menu-action"
            onClick={() => { onOpenAddWaterSource(); if (isMobile) onToggle(); }}
            disabled={addModeActive}
            type="button"
          >
            <span className="pdg-menu-action-icon">＋</span>
            <span>{t("addWS.openButton")}</span>
            {addModeActive && <span className="pdg-menu-action-hint">{t("sidebar.inProgress")}</span>}
          </button>
        </Section>

        {/* ADMIN — only visible to admins */}
        {isAdmin && (
          <Section
            title={t("sidebar.admin")}
            open={adminOpen}
            onToggle={() => setAdminOpen((o) => !o)}
          >
            <button
              className="pdg-menu-action pdg-menu-action-secondary"
              onClick={() => { onOpenUserManagement(); if (isMobile) onToggle(); }}
              type="button"
            >
              <span className="pdg-menu-action-icon">👥</span>
              <span>{t("users.manageUsers")}</span>
            </button>
          </Section>
        )}

        {/* WATERSHEDS */}
        <Section
          title={t("watershed.title")}
          open={watershedsOpen}
          onToggle={() => setWatershedsOpen((o) => !o)}
        >
          {!tree && <p className="pdg-menu-muted">…</p>}
          {tree && (
            <ul className="pdg-tree">
              {tree.map((n) => (
                <TreeNode
                  key={n.id}
                  node={n}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={(node) => { onSelect(node); if (isMobile) onToggle(); }}
                  costById={byId}
                  isAdmin={isAdmin}
                  onRenamed={(id, name) => {
                    function patch(nodes: WatershedNode[]): WatershedNode[] {
                      return nodes.map((x) =>
                        x.id === id ? { ...x, name } : { ...x, children: patch(x.children) }
                      );
                    }
                    setTree((prev) => (prev ? patch(prev) : prev));
                  }}
                />
              ))}
            </ul>
          )}
        </Section>
      </aside>
      {!isMobile && (
        <button
          className={`pdg-sidebar-toggle ${open ? "" : "is-edge"}`}
          onClick={onToggle}
          aria-label={open ? "Fold sidebar" : "Unfold sidebar"}
          title={open ? "Fold sidebar" : "Unfold sidebar"}
        >
          {open ? "‹" : "›"}
        </button>
      )}
      {isMobile && open && <div className="pdg-backdrop" onClick={onToggle} />}
    </>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="pdg-section">
      <button className="pdg-section-header" onClick={onToggle} type="button" aria-expanded={open}>
        <span className="pdg-section-caret">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
      </button>
      {open && <div className="pdg-section-body">{children}</div>}
    </section>
  );
}

function TreeNode({
  node, depth, selectedId, onSelect, costById, isAdmin, onRenamed,
}: {
  node: WatershedNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: WatershedNode | null) => void;
  costById: Map<string, WatershedCostSummary>;
  isAdmin: boolean;
  onRenamed: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [saving, setSaving] = useState(false);
  const selected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const kindLabel = t(`watershed.kind_${node.kind}`, { defaultValue: node.kind });
  const cost = costById.get(node.id);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(node.name);
    setEditing(true);
  }
  async function commitEdit() {
    const next = draft.trim();
    if (!next || next === node.name) { setEditing(false); return; }
    setSaving(true);
    try {
      await api(`/api/watersheds/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      onRenamed(node.id, next);
    } catch (err) {
      console.error("rename failed", err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <li>
      <div
        className={`pdg-tree-row ${selected ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span
          onClick={() => hasChildren && setOpen(!open)}
          className="pdg-tree-toggle"
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          {open ? "▾" : "▸"}
        </span>
        {editing ? (
          <span className="pdg-tree-label" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                else if (e.key === "Escape") setEditing(false);
              }}
              disabled={saving}
              style={{ flex: 1, font: "inherit", padding: "2px 6px", border: "1px solid #1976d2", borderRadius: 3 }}
            />
            <button onClick={commitEdit} disabled={saving} className="pdg-tree-rename-btn" title="Save">✓</button>
            <button onClick={() => setEditing(false)} disabled={saving} className="pdg-tree-rename-btn" title="Cancel">×</button>
          </span>
        ) : (
          <span
            onClick={() => onSelect(selected ? null : node)}
            className="pdg-tree-label"
            title={`${kindLabel}${node.areaKm2 ? ` · ${node.areaKm2} km²` : ""}`}
          >
            <div className="pdg-tree-main">
              <span>{node.name}</span>
              {cost && cost.actualInr > 0 && (
                <span className="pdg-tree-badge">{inr(cost.actualInr, { compact: true })}</span>
              )}
              {isAdmin && (
                <button
                  className="pdg-tree-rename-icon"
                  onClick={startEdit}
                  title={t("watershed.rename", { defaultValue: "Rename" })}
                  type="button"
                >
                  ✎
                </button>
              )}
            </div>
            <div className="pdg-tree-kind">
              {kindLabel}
              {cost && cost.taskCount > 0 && ` · ${cost.taskCount} ${t("rollup.tasks")}`}
            </div>
          </span>
        )}
      </div>
      {open && hasChildren && (
        <ul className="pdg-tree">
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              costById={costById}
              isAdmin={isAdmin}
              onRenamed={onRenamed}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
