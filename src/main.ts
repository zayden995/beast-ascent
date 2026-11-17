import './style.css';
import { App, showFatal } from './game/App.ts';
import { installDebug } from './game/debug.ts';
import { adminEnabled } from './logic/admin.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
canvas.tabIndex = 0;

try {
  const params = new URLSearchParams(window.location.search);
  // ?admin adds the admin sandbox to the title screen, on the dev server only (not on the published site).
  const app = new App(canvas, ui, { admin: adminEnabled(window.location.search, import.meta.env.DEV) });
  app.start();
  if (import.meta.env.DEV || params.has('debug')) installDebug(app);
} catch (err) {
  console.error(err);
  showFatal(ui, 'Beast Ascent needs WebGL. Try a recent version of Chrome, Edge or Firefox with hardware acceleration on.');
}
