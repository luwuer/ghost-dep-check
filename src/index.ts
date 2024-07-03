import * as fsp from 'fs/promises';
import path from 'path';
import { parse } from '@vue/compiler-sfc';
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import { progress } from 'terminal-progress';
import { isBuiltinModule, processFileWithReg, isAbsolutePath, isRelativePath } from './utils/index.ts';
import logger, { LogLevel } from './utils/logger.ts';

interface CheckConfig {
  logLevel?: LogLevel;
  encoding?: BufferEncoding;
  excludeAlias?: string[];
}

enum ExtNames {
  vue = '.vue',
  ts = '.ts',
  js = '.js',
}
let checkConfig: CheckConfig = {
  logLevel: 1,
  encoding: 'utf-8',
  excludeAlias: [],
};

export async function processFile(filePath: string): Promise<Set<string>> | null {
  try {
    const extname = path.extname(filePath);

    switch (extname) {
      case ExtNames.vue:
        return await processVue(filePath);
      case ExtNames.ts:
        return await processTs(filePath);
      case ExtNames.js:
        return await processJs(filePath);
      default:
        logger.warning(`Unknown file type: ${extname}`);
        return null;
    }
  } catch (err) {
    logger.error(`Error when processing file: ${filePath}`);
    logger.error(err);
    return await processFileWithReg(filePath);
  }
}

async function processVue(filePath: string) {
  const content = await fsp.readFile(filePath, checkConfig.encoding);
  const { descriptor } = parse(content);
  const jsContent = descriptor.script?.content || '';
  const curPkgSet = new Set<string>();

  if (jsContent) {
    const ast = parser.parse(jsContent, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators', 'dynamicImport', 'exportDefaultFrom'],
    });

    traverse.default(ast, {
      ImportDeclaration(path: any) {
        const pkgName = path.node.source.value;
        curPkgSet.add(pkgName);
      },
      Import(path) {
        if (path.parent.type === 'CallExpression' && path.parent.callee.type === 'Import') {
          const pkgName = path.parent.arguments[0].value;
          curPkgSet.add(pkgName);
        }
      },
      CallExpression(path) {
        if (path.node.callee.name === 'require' || path.node.callee.name === 'import') {
          const arg = path.node.arguments[0];
          const pkgName = arg.value;
          curPkgSet.add(pkgName);
        }
      },
    });
  }

  return curPkgSet;
}

async function processTs(filePath: string) {
  const content = await fsp.readFile(filePath, checkConfig.encoding);
  const curPkgSet = new Set<string>();

  if (content) {
    const ast = parser.parse(content, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'dynamicImport', 'exportDefaultFrom', 'importAssertions'],
    });

    traverse.default(ast, {
      ImportDeclaration(path: any) {
        const pkgName = path.node.source.value;
        curPkgSet.add(pkgName);
      },
      Import(path) {
        if (path.parent.type === 'CallExpression' && path.parent.callee.type === 'Import') {
          const pkgName = path.parent.arguments[0].value;
          curPkgSet.add(pkgName);
        }
      },
      CallExpression(path) {
        if (path.node.callee.name === 'require' || path.node.callee.name === 'import') {
          const arg = path.node.arguments[0];
          const pkgName = arg.value;
          curPkgSet.add(pkgName);
        }
      },
    });
  }

  return curPkgSet;
}

async function processJs(filePath: string) {
  const content = await fsp.readFile(filePath, checkConfig.encoding);
  const curPkgSet = new Set<string>();

  if (content) {
    const ast = parser.parse(content, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'dynamicImport', 'exportDefaultFrom'],
    });

    traverse.default(ast, {
      ImportDeclaration(path: any) {
        const pkgName = path.node.source.value;
        curPkgSet.add(pkgName);
      },
      Import(path) {
        if (path.parent.type === 'CallExpression' && path.parent.callee.type === 'Import') {
          const pkgName = path.parent.arguments[0].value;
          curPkgSet.add(pkgName);
        }
      },
      CallExpression(path) {
        if (path.node.callee.name === 'require' || path.node.callee.name === 'import') {
          const arg = path.node.arguments[0];
          const pkgName = arg.value;
          curPkgSet.add(pkgName);
        }
      },
    });

    return curPkgSet;
  }
}

/**
 * 收集包名
 * @param pkgName
 * @returns
 */
function collectPkg(pkgs: Set<string>, appendPkgs: Set<string>, excludeReg: RegExp) {
  appendPkgs.forEach(pkgName => {
    if (isBuiltinModule(pkgName) || isAbsolutePath(pkgName) || isRelativePath(pkgName)) return;

    if (/^\d+$/.test(pkgName)) return;

    if (excludeReg.test(pkgName)) return;

    pkgs.add(pkgName);
  });
}

/**
 * 从指定的 package.json 文件中获取明确依赖的包名
 * @param files
 * @returns
 */
async function getDefinedPkgs(files: string[]): Promise<Set<string>> {
  const pkgs = new Set<string>();

  for (const file of files) {
    const definedDataStr = await fsp.readFile(file, 'utf-8');
    const definedData = JSON.parse(definedDataStr);
    const dependencies = Object.keys(definedData.dependencies || {});

    dependencies.forEach(dep => {
      pkgs.add(dep);
    });
  }

  logger.debug('getDefinedPkgs: ', pkgs);
  return pkgs;
}

/**
 * 从指定文件中获取引用过的包名
 * @param files
 * @returns
 */
async function getReferPkgs(files: string[], config: CheckConfig): Promise<Set<string>> {
  const excludeAliasReg = new RegExp(`^(${config.excludeAlias.join('|')})\/`);
  const referPkgs = new Set<string>();
  const total = files.length;
  let finish = 0;

  progress({ name: 'Checking files', current: finish, total: total });

  for (const file of files) {
    const pkgs = await processFile(file);
    if (pkgs) {
      collectPkg(referPkgs, pkgs, excludeAliasReg);
    }

    finish++;
    progress({ name: 'Checking files', current: finish, total: total });
  }

  logger.debug('getReferPkgs: ', referPkgs);
  return referPkgs;
}

/**
 * 幽灵依赖检查
 * @param files
 * @param userConfig
 * @returns
 */
export async function ghostDepCheck(files: string[], pkgDefFiles: string[], userConfig?: CheckConfig) {
  const ghostDepList: string[] = [];
  const config = Object.assign(checkConfig, userConfig || {});

  if (!files.length) {
    return ghostDepList;
  }

  // 1. 应用日志
  logger.setConfig({ prefix: 'ghost-dep-check', level: config.logLevel });

  // 2. 获取引用的依赖
  const referPkgs = await getReferPkgs(files, config);
  // 3. 获取定义的依赖
  const definedPkgs = await getDefinedPkgs(pkgDefFiles);

  // 4. 对比依赖
  referPkgs.forEach(pkg => {
    const pkgName = pkg.match(/^(?:@([^/]+)[/])?([^/]+)/)?.[0] || pkg;
    if (!definedPkgs.has(pkgName)) {
      ghostDepList.push(pkg);
    }
  });

  return ghostDepList;
}
