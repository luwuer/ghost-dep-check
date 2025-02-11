import * as fsp from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { parse } from '@vue/compiler-sfc';
import parser, { ParseResult } from '@babel/parser';
import traverse from '@babel/traverse';
import { progress } from 'terminal-progress';
import { isValidThirdPartyPkg, processFileWithReg, normalizePkgName } from './utils/index.ts';
import logger, { LogLevel } from './utils/logger.ts';
import { exportGhostDep } from './utils/export.ts'
import { GhostDependencyMap } from './types/index.ts'

type SpecialDepFunction = (file: string) => string[]
interface CheckConfig {
  excludeAlias?: string[];
  specialDepFunctions?: SpecialDepFunction[];
  name?: string;
  logLevel?: LogLevel;
  encoding?: BufferEncoding;
}

interface CheckConfigInt extends CheckConfig {
  dir: string
}

enum ExtNames {
  vue = '.vue',
  ts = '.ts',
  js = '.js',
}

let checkConfig: CheckConfig = {
  logLevel: LogLevel.INFO,
  encoding: 'utf-8',
  excludeAlias: [],
  specialDepFunctions: [],
  name: 'Checking files',
};

let checkConfigInt: CheckConfigInt = {
  dir: '',
  ...checkConfig
}

async function processFile(filePath: string): Promise<Set<string>> | null {
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
  let curPkgSet = new Set<string>();

  if (jsContent) {
    const ast = parser.parse(jsContent, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators', 'dynamicImport', 'exportDefaultFrom'],
    });

    curPkgSet = traverseAst(ast)
  }

  return curPkgSet;
}

async function processTs(filePath: string) {
  const content = await fsp.readFile(filePath, checkConfig.encoding);
  let curPkgSet = new Set<string>();

  if (content) {
    const ast = parser.parse(content, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'dynamicImport', 'exportDefaultFrom', 'importAssertions'],
    });

    curPkgSet = traverseAst(ast)
  }

  return curPkgSet
}

async function processJs(filePath: string) {
  const content = await fsp.readFile(filePath, checkConfig.encoding);
  let curPkgSet = new Set<string>();

  if (content) {
    const ast = parser.parse(content, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'dynamicImport', 'exportDefaultFrom'],
    });

    curPkgSet = traverseAst(ast)
  }

  return curPkgSet
}

function traverseAst(ast: ParseResult<any>): Set<string> {
  const curPkgSet = new Set<string>();

  traverse.default(ast, {
    ImportDeclaration(path) {
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

  return curPkgSet
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
    const devDependencies = Object.keys(definedData.devDependencies || {});

    // dep
    dependencies.forEach(dep => {
      pkgs.add(dep);
    });

    // dev dep
    devDependencies.forEach(dep => {
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
async function getReferPkgs(files: string[], config: CheckConfig): Promise<[Set<string>, Map<string, string[]>]> {
  const excludeAliasReg = new RegExp(`^(${config.excludeAlias.join('|')})(\/|$)`);
  const referPkgs = new Set<string>();
  const dependencyMap = new Map<string, string[]>();
  const total = files.length;
  let finish = 0;

  progress({ name: config.name, current: finish, total: total });
  await Promise.all(files.map(async (file) => {
    const pkgs = await processFile(file);
    
    // 1. 更新进度
    finish++;
    progress({ name: config.name, current: finish, total: total });

    if (!pkgs) return;

    // 2. 保存引用包信息
    pkgs.forEach(pkg => {
      // 2.1 跳过非法第三方包名
      if (!isValidThirdPartyPkg(pkg)) return;
      // 2.2 跳过自定义配置忽略的包名
      if (excludeAliasReg.test(pkg)) return;

      // 2.3 收集包名
      referPkgs.add(pkg);
      // 2.4 收集依赖关系
      if (!dependencyMap.has(pkg)) {
        dependencyMap.set(pkg, []);
      }
      dependencyMap.get(pkg)!.push(file);
    });
  }));

  logger.debug('getReferPkgs: ', referPkgs);
  return [referPkgs, dependencyMap];
}

/**
 * 获取目录下所有的 package.json 路径
 * @param baseDir
 * @returns 
 */
async function getPkgJsons(baseDir: string): Promise<string[]> {
  const pkgPattern = `${baseDir}/**/package.json`;
  return glob(pkgPattern, {
    ignore: [
      path.join(baseDir, '**/node_modules/**'),
    ],
  })
    .then(async (files) => {
      if (!files.length) return [];
      return files
    })
}

/**
 * 返回合法的包名
 * @param pgks 
 * @param config 
 * @returns 
 */
function getLegalPkgs(pgks: Set<string>, config: CheckConfigInt) {
  const excludeAliasReg = new RegExp(`^(${config.excludeAlias.join('|')})(\/|$)`);
  const legalPkgs = new Set<string>()

  pgks.forEach(pkgStr => {
    if (!pkgStr) return;

    const pkgName = normalizePkgName(pkgStr);
    if(!isValidThirdPartyPkg(pkgName)) return
    if (excludeAliasReg.test(pkgName)) return;

    legalPkgs.add(pkgName);
  });

  return legalPkgs
}

/**
 * 根据文件路径，获取可以为当前路径定义依赖的 package.json 文件
 * @param file 
 * @param pkgJsonList 
 * @returns 
 */
function getPkgDefFiles(file: string, pkgJsonList: string[], specialDepFunctions: SpecialDepFunction[]) {
  const defFiles: string[] = []

  // 目录依赖
  pkgJsonList.forEach(pkgJsonItem => {
    const dirname = path.dirname(pkgJsonItem);

    if (file.indexOf(dirname) === 0) {
      defFiles.push(pkgJsonItem)
    }
  })

  // 特殊规则依赖
  specialDepFunctions.forEach(func => {
    defFiles.push(...func(file));
  })

  return defFiles
}

/**
 * 幽灵依赖检查
 * @param { Array<string> } files 需要检查的文件
 * @param { Array<string> } pkgDefFiles 定义文件依赖的 package.json 
 * @param { CheckConfig } userConfig
 * @returns
 */
export async function ghostDepCheck(files: string[], pkgDefFiles: string[], userConfig?: CheckConfig) {
  const ghostDepMap: GhostDependencyMap = {};
  const config = Object.assign(checkConfig, userConfig || {});

  if (!files.length) {
    return [];
  }

  // 1. 应用日志
  logger.setConfig({ prefix: 'ghost-dep-check', level: config.logLevel });

  // 2. 获取引用的依赖和依赖映射
  const [referPkgs, dependencyMap] = await getReferPkgs(files, config);
  // 3. 获取定义的依赖
  const definedPkgs = await getDefinedPkgs(pkgDefFiles);

  // 4. 对比依赖并记录使用位置
  const ghostDepList: string[] = [];
  referPkgs.forEach(pkg => {
    const pkgName = pkg.match(/^(?:@([^/]+)[/])?([^/]+)/)?.[0] || pkg;
    if (!definedPkgs.has(pkgName)) {
      ghostDepList.push(pkg);
      ghostDepMap[pkg] = dependencyMap.get(pkg) || [];
    }
  });

  // 5. 导出 JSON 文件
  await exportGhostDep(ghostDepMap)

  return ghostDepList;
}

/**
 * 智能的幽灵依赖检查（根据每个文件的位置自动匹配依赖定义文件）
 * @param { Array<string> } files 需要检查的文件
 * @param { CheckConfigInt } userConfig
 * @returns
 */
export async function ghostDepCheckInt(files: string[], userConfig: CheckConfigInt): Promise<string[]> {
  const ghostDepMap: GhostDependencyMap = {};
  const config = Object.assign(checkConfigInt, userConfig || {});

  if (!files.length) {
    return [];
  }

  // 1. 应用日志
  logger.setConfig({ prefix: 'ghost-dep-check', level: config.logLevel });

  // 2. 获取 package 定义文件
  const pkgJsonList = await getPkgJsons(config.dir)

  // 3. 获取引用的依赖和依赖映射
  const [referPkgs, dependencyMap] = await getReferPkgs(files, config);

  // 4. 处理每个文件的依赖
  for (const file of files) {
    const pkgs = await processFile(file);

    if (pkgs) {
      // 获取合法的引用包名
      const legalPkgs = getLegalPkgs(pkgs, config);
      // 获取当前文件依赖的包定义文件
      const pkgDefFiles = getPkgDefFiles(file, pkgJsonList, config.specialDepFunctions)
      // 获取当前文件位置定义过的包名
      const definedPkgs = await getDefinedPkgs(pkgDefFiles);

      // 对比并记录未定义的包名
      legalPkgs.forEach(pkg => {
        const pkgName = pkg.match(/^(?:@([^/]+)[/])?([^/]+)/)?.[0] || pkg;
        if (!definedPkgs.has(pkgName)) {
          if (!ghostDepMap[pkg]) {
            ghostDepMap[pkg] = dependencyMap.get(pkg) || [];
          }
        }
      });
    }
  }

  // 5. 导出 JSON 文件
  await exportGhostDep(ghostDepMap)

  return Object.keys(ghostDepMap);
}