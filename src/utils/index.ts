import * as fs from 'fs';
import * as module from 'module';
import logger from './logger.ts';

const importRegex = /import .*? from ['"]([^'"]+)['"]/g;
const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

function extractPackageName(match: RegExpExecArray) {
  return match[1];
}

export function processFileWithReg(filePath: string, pkgSet: Set<string>) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const pkgName = extractPackageName(match);

      if (!pkgSet.has(pkgName) && !module.builtinModules.includes(pkgName)) {
        logger.debug(`In file ${filePath} import: `, pkgName);
        pkgSet.add(pkgName);
      }
    }

    while ((match = requireRegex.exec(content)) !== null) {
      const pkgName = extractPackageName(match);

      if (!pkgSet.has(pkgName) && !module.builtinModules.includes(pkgName)) {
        logger.debug(`In file ${filePath} require:`, pkgName);
        pkgSet.add(pkgName);
      }
    }
  } catch (err) {
    logger.error(`Error reading file ${filePath}: ${err}`);
  }
}

/**
 * 是否为内联模块
 * @param pkgName
 * @returns
 */
export function isBuiltinModule(pkgName: string) {
  return module.builtinModules.includes(pkgName);
}

/**
 * 是否为绝对路径
 * @param pkgName
 * @returns
 */
export function isAbsolutePath(pkgName: string) {
  const absolutePathRegex = /^(\/|[A-Za-z]:\\)/;
  return absolutePathRegex.test(pkgName);
}

/**
 * 是否为相对路径
 * @param pkgName
 * @returns
 */
export function isRelativePath(pkgName: string) {
  const relativePathRegex = /^[.]/;
  return relativePathRegex.test(pkgName);
}
