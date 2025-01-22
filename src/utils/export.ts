import * as fsp from 'fs/promises';
import path from 'path';
import logger from './logger.ts';
import { GhostDependencyMap } from '../types/index.ts'

/**
 * 格式化依赖映射为易读的 JSON 字符串
 */
function formatGhostDepMap(ghostDepMap: GhostDependencyMap): string {
  const sortedMap: GhostDependencyMap = {};

  // 按包名排序
  Object.keys(ghostDepMap)
    .sort()
    .forEach(key => {
      // 对每个包的依赖文件列表也进行排序
      sortedMap[key] = ghostDepMap[key].sort();
    });

  return JSON.stringify(sortedMap, null, 2);
}

/**
 * 导出幽灵依赖 - JSON 格式
 * @param ghostDepMap
 */
export async function exportGhostDep(ghostDepMap: GhostDependencyMap) {
  if (Object.keys(ghostDepMap).length === 0) return;

  const outputPath = path.join(process.cwd(), 'ghost-dependencies.json');
  await fsp.writeFile(outputPath, formatGhostDepMap(ghostDepMap));
  logger.info(`Ghost dependencies saved to: ${outputPath}`);
}
