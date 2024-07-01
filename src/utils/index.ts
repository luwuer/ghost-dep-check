import * as fsp from 'fs/promises';
import * as module from 'module';
import logger from './logger.ts';

const importRegex = /import .*? from ['"]([^'"]+)['"]/g;
const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
const dyImportRegex = /import\(['"]([^'"]+)['"]\)/g;

function extractPackageName(match: RegExpExecArray) {
  return match[1];
}

export async function processFileWithReg(filePath: string) {
  const pkgSet = new Set<string>();
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const pkgName = extractPackageName(match);

      logger.debug(`In file ${filePath} import: `, pkgName);
      pkgSet.add(pkgName);
    }

    while ((match = requireRegex.exec(content)) !== null) {
      const pkgName = extractPackageName(match);

      logger.debug(`In file ${filePath} require: `, pkgName);
      pkgSet.add(pkgName);
    }

    while ((match = dyImportRegex.exec(content)) !== null) {
      const pkgName = extractPackageName(match);

      logger.debug(`In file ${filePath} dynamic import: `, pkgName);
      pkgSet.add(pkgName);
    }

    return pkgSet;
  } catch (err) {
    logger.error(`Error reading file ${filePath}: ${err}`);
    return pkgSet;
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
