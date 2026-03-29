import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const clientManifestPath = path.resolve('build/client/.vite/manifest.json');
const serverDir = path.resolve('build/server');
const serverManifestPath = path.join(serverDir, 'client-manifest.json');

await mkdir(serverDir, { recursive: true });
await copyFile(clientManifestPath, serverManifestPath);
