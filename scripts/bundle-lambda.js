/**
 * Lambda用デプロイパッケージを作成するスクリプト
 * dist/lambda-package/ に必要なファイルをコピー
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_DIR = path.join(DIST_DIR, 'lambda-package');
const NODE_MODULES_DIR = path.join(ROOT_DIR, 'node_modules');

// Lambda用に必要なパッケージ
const REQUIRED_PACKAGES = [
  'playwright-core',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@aws-sdk/types',
  '@aws-sdk/util-dynamodb',
  '@aws-sdk/core',
  '@aws-sdk/client-sso-oidc',
  '@aws-sdk/client-sts',
  '@aws-sdk/credential-provider-node',
  '@aws-sdk/middleware-host-header',
  '@aws-sdk/middleware-logger',
  '@aws-sdk/middleware-recursion-detection',
  '@aws-sdk/middleware-user-agent',
  '@aws-sdk/region-config-resolver',
  '@aws-sdk/util-endpoints',
  '@aws-sdk/util-user-agent-browser',
  '@aws-sdk/util-user-agent-node',
  '@smithy',
  'tslib',
  'uuid',
  'fast-xml-parser',
  'strnum',
];

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

function main() {
  console.log('Lambda用パッケージを作成中...');

  // 既存のパッケージディレクトリを削除
  if (fs.existsSync(PACKAGE_DIR)) {
    fs.rmSync(PACKAGE_DIR, { recursive: true });
  }
  fs.mkdirSync(PACKAGE_DIR, { recursive: true });

  // dist/*.js をコピー
  console.log('コンパイル済みJSファイルをコピー中...');
  const jsFiles = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.js'));
  for (const file of jsFiles) {
    fs.copyFileSync(
      path.join(DIST_DIR, file),
      path.join(PACKAGE_DIR, file)
    );
  }

  // node_modules をコピー
  console.log('node_modules をコピー中...');
  const packageNodeModules = path.join(PACKAGE_DIR, 'node_modules');
  fs.mkdirSync(packageNodeModules, { recursive: true });

  for (const pkg of REQUIRED_PACKAGES) {
    const srcPath = path.join(NODE_MODULES_DIR, pkg);
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(packageNodeModules, pkg);
      console.log(`  ${pkg}`);
      copyFolderSync(srcPath, destPath);
    }
  }

  // @smithy の全パッケージをコピー
  const smithyDir = path.join(NODE_MODULES_DIR, '@smithy');
  if (fs.existsSync(smithyDir)) {
    const smithyPackages = fs.readdirSync(smithyDir);
    for (const pkg of smithyPackages) {
      const srcPath = path.join(smithyDir, pkg);
      const destPath = path.join(packageNodeModules, '@smithy', pkg);
      console.log(`  @smithy/${pkg}`);
      copyFolderSync(srcPath, destPath);
    }
  }

  // @aws-sdk の全パッケージをコピー
  const awsSdkDir = path.join(NODE_MODULES_DIR, '@aws-sdk');
  if (fs.existsSync(awsSdkDir)) {
    const awsSdkPackages = fs.readdirSync(awsSdkDir);
    for (const pkg of awsSdkPackages) {
      const srcPath = path.join(awsSdkDir, pkg);
      const destPath = path.join(packageNodeModules, '@aws-sdk', pkg);
      console.log(`  @aws-sdk/${pkg}`);
      copyFolderSync(srcPath, destPath);
    }
  }

  console.log('\nLambda用パッケージが作成されました: dist/lambda-package/');
  console.log('SAMデプロイ時はこのディレクトリを使用してください');
}

main();
