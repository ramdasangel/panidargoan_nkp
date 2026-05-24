import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { inr } from "../format";
import type { WatershedCostSummary, WatershedNode } from "../types";

interface Props {
  selectedId: string | null;
  onSelect: (node: WatershedNode | null) => void;
}

export function WatershedSidebar({ selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<WatershedNode[] | null>(null);
  const [summaries, setSummaries] = useState<WatershedCostSummary[]>([]);

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

  return (
    <aside style={styles.aside}>
      <h3 style={styles.h3}>{t("watershed.title")}</h3>
      {!tree && <p style={styles.muted}>…</p>}
      {tree && (
        <ul style={styles.list}>
          {tree.map((n) => (
            <TreeNode key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} costById={byId} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function TreeNode({
  node, depth, selectedId, onSelect, costById,
}: {
  node: WatershedNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: WatershedNode | null) => void;
  costById: Map<string, WatershedCostSummary>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(depth < 2);
  const selected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const kindLabel = t(`watershed.kind_${node.kind}`, { defaultValue: node.kind });
  const cost = costById.get(node.id);

  return (
    <li>
      <div
        style={{
          ...styles.row,
          ...(selected ? styles.rowSelected : {}),
          paddingLeft: 8 + depth * 14,
        }}
      >
        <span
          onClick={() => hasChildren && setOpen(!open)}
          style={{ ...styles.toggle, visibility: hasChildren ? "visible" : "hidden" }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span
          onClick={() => onSelect(selected ? null : node)}
          style={styles.label}
          title={`${kindLabel}${node.areaKm2 ? ` · ${node.areaKm2} km²` : ""}`}
        >
          <div style={styles.nodeMain}>
            <span>{node.name}</span>
            {cost && cost.actualInr > 0 && (
              <span style={styles.badge}>{inr(cost.actualInr, { compact: true })}</span>
            )}
          </div>
          <div style={styles.kind}>
            {kindLabel}
            {cost && cost.taskCount > 0 && ` · ${cost.taskCount} ${t("rollup.tasks")}`}
          </div>
        </span>
      </div>
      {open && hasChildren && (
        <ul style={styles.list}>
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} costById={costById} />
          ))}
        </ul>
      )}
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
  aside: {
    width: 280,
    minWidth: 240,
    background: "#fafafa",
    borderRight: "1px solid #e0e0e0",
    padding: "12px 0",
    overflowY: "auto",
    fontSize: 13,
  },
  h3: { margin: "0 12px 8px", fontSize: 14, color: "#333" },
  muted: { color: "#888", margin: "0 12px" },
  list: { listStyle: "none", margin: 0, padding: 0 },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    padding: "4px 8px",
    cursor: "default",
  },
  rowSelected: { background: "#e3f2fd" },
  toggle: { color: "#999", width: 12, cursor: "pointer", userSelect: "none", paddingTop: 1 },
  label: { cursor: "pointer", flex: 1, minWidth: 0 },
  nodeMain: { display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" },
  kind: { color: "#888", fontSize: 10, marginTop: 1 },
  badge: { fontSize: 10, color: "#1976d2", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
};
