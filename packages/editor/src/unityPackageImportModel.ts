// Author: MiYu
export type UnityPackageAnalysis = {
  fingerprint: string;
  source_path: string;
  asset_count: number;
  prefab_count: number;
  particle_count: number;
  mesh_count: number;
  texture_count: number;
  assets: Array<{ guid: string; path: string; kind: string; sha256: string }>;
  warnings: string[];
  blockers: string[];
};

export type UnityPackageImportResult = {
  report: UnityPackageAnalysis;
  destination: string;
  prefab_paths: string[];
  manifest_path: string;
};

export function canImportUnityPackage(report: UnityPackageAnalysis | null): boolean {
  return !!report && report.fingerprint.length > 0 && report.blockers.length === 0 && report.asset_count > 0;
}
