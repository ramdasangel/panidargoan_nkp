export interface WatershedNode {
  id: string;
  code: string;
  name: string;
  kind: string;
  level: number;
  parentId: string | null;
  areaKm2: number | null;
  children: WatershedNode[];
}

export type WaterSourceType =
  | "river" | "stream" | "canal" | "pond" | "lake" | "well" | "borewell"
  | "check_dam" | "bandhara" | "kt_weir" | "percolation_tank" | "farm_pond"
  | "spring" | "other";

export interface MapLayers {
  villages: boolean;
  talukas: boolean;
  watersheds: boolean;
  waterSourcesManual: boolean;
  waterSourcesAuto: boolean;
  terrain: boolean;
}

export type WaterSourceOrigin = "manual" | "osm" | "imported";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type TaskStatus = "not_started" | "in_progress" | "blocked" | "completed";

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  sponsor: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetInr: number | null;
  plannedTotalInr: number;
  actualTotalInr: number;
  taskCount: number;
  tasksDone: number;
}

export interface TaskGeoLink {
  id: string;
  targetType: "village" | "water_source" | "watershed" | "custom_point" | "custom_polygon";
  village: { id: string; name: string; code: string } | null;
  waterSource: { id: string; name: string; code: string; type: string } | null;
  watershed: { id: string; name: string; code: string; kind: string } | null;
}

export interface ProjectTask {
  id: string;
  code: string;
  name: string;
  status: TaskStatus;
  startDate: string | null;
  endDate: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  plannedCostInr: number | null;
  actualCostInr: number;
  geoLinks: TaskGeoLink[];
  allocations: Array<{
    id: string;
    plannedQuantity: number;
    plannedUnitRateInr: number;
    plannedCostInr: number;
    resource: { code: string; name: string; unit: string };
  }>;
}

export interface ProjectDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  sponsor: string | null;
  budgetInr: number | null;
  tasks: ProjectTask[];
}

export interface WatershedCostSummary {
  watershedId: string;
  plannedInr: number;
  actualInr: number;
  taskCount: number;
}

export interface WatershedRollup {
  watershed: { id: string; name: string; code: string; kind: string; level: number };
  descendantCount: number;
  totalPlannedInr: number;
  totalActualInr: number;
  projects: Array<{ id: string; code: string; name: string; plannedInr: number; actualInr: number; taskCount: number }>;
  tasks: Array<{
    projectCode: string; projectName: string;
    taskId: string; taskCode: string; taskName: string;
    linkKind: "direct_watershed" | "water_source_in_subtree" | "village_overlap";
    allocationPercent: number;
    plannedInr: number; actualInr: number;
  }>;
}
