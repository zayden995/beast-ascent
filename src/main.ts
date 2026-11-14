import './style.css';
import { App, showFatal } from './game/App.ts';
import { installDebug } from './game/debug.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
canvas.tabIndex = 0;

try {
  const params = new URLSearchParams(window.location.search);
  // ?admin adds the admin sandbox to the title screen. It is not linked from anywhere in the game.
  const app = new App(canvas, ui, { admin: params.has('admin') });
  app.start();
  if (import.meta.env.DEV || params.has('debug')) installDebug(app);
} catch (err) {
  console.error(err);
  showFatal(ui, 'Beast Ascent needs WebGL. Try a recent version of Chrome, Edge or Firefox with hardware acceleration on.');
}
