/**
 * Lambda用パッケージに必要なnode_modulesをコピーするスクリプト
 * 依存関係を再帰的に解決してコピー
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');
const PACKAGE_DIR = path.join(ROOT_DIR, 'dist', 'lambda-package');

// コピー済みパッケージを追跡
const copiedPackages = new Set();

function copyFolderSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * パッケージの依存関係を取得
 */
function getDependencies(pkgName) {
  const pkgJsonPath = path.join(NODE_MODULES_DIR, pkgName, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return [];
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  return Object.keys(pkgJson.dependencies || {});
}

/**
 * パッケージとその依存関係を再帰的にコピー
 */
function copyPackageWithDeps(pkgName, packageNodeModules) {
  if (copiedPackages.has(pkgName)) {
    return;
  }

  const srcPath = path.join(NODE_MODULES_DIR, pkgName);
  const destPath = path.join(packageNodeModules, pkgName);

  if (!fs.existsSync(srcPath)) {
    console.warn(`  [WARN] ${pkgName} が見つかりません（スキップ）`);
    return;
  }

  copyFolderSync(srcPath, destPath);
  copiedPackages.add(pkgName);
  console.log(`  ${pkgName}: OK`);

  // 依存関係を再帰的にコピー
  const deps = getDependencies(pkgName);
  for (const dep of deps) {
    copyPackageWithDeps(dep, packageNodeModules);
  }
}

function main() {
  console.log('Lambda用パッケージをコピー中...');

  const packageNodeModules = path.join(PACKAGE_DIR, 'node_modules');

  // ルートパッケージ（これらの依存関係も自動的にコピーされる）
  const rootPackages = [
    'playwright-core',
    '@sparticuz/chromium',
  ];

  for (const pkg of rootPackages) {
    copyPackageWithDeps(pkg, packageNodeModules);
  }

  console.log(`\n合計 ${copiedPackages.size} パッケージをコピーしました`);
  console.log('Lambdaパッケージ作成完了: dist/lambda-package/');
}

main();
