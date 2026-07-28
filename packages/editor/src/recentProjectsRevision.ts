import type { RecentProjectInfo } from './transport/editorTransport.ts';

export function recentProjectsRevision(
  projects: readonly RecentProjectInfo[],
): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let sourceOffset = 0;
  projects.forEach((project, index) => {
    const source = JSON.stringify([
      index,
      project.name,
      project.path,
      project.lastOpenedAt,
    ]);
    for (let offset = 0; offset < source.length; offset += 1) {
      const code = source.charCodeAt(offset);
      hashA = Math.imul(hashA ^ code, 0x01000193);
      hashB = Math.imul(
        hashB ^ (code + sourceOffset + offset),
        0x85ebca6b,
      );
    }
    sourceOffset += source.length;
  });
  return `recent-projects-v1-${projects.length}-${
    (hashA >>> 0).toString(16).padStart(8, '0')
  }${(hashB >>> 0).toString(16).padStart(8, '0')}`;
}
