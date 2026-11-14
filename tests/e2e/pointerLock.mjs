// The game takes the mouse lock (pointer lock) when a game starts. In a test browser on Windows the real
// lock confines the user's REAL mouse cursor to the browser window, which sits in the top-left of the
// screen, and Windows keeps that confinement after the browser has closed. Whoever is sitting at the
// computer while the tests run finds their cursor stuck in a corner.
//
// So the tests give the page a stand-in lock: it looks the same to the game (`document.pointerLockElement`,
// the `pointerlockchange` event, `exitPointerLock`) but never touches the operating system.
// Set REAL_POINTER_LOCK=1 to use the browser's own lock instead; the cursor is then released at the end.
import { execFileSync } from 'node:child_process';

export const realPointerLock = process.env.REAL_POINTER_LOCK === '1';

/** Replaces the page's pointer lock with one that cannot confine the user's cursor. */
export async function stubPointerLock(page) {
  await page.addInitScript(() => {
    let locked = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
    Element.prototype.requestPointerLock = function () {
      if (locked !== this) {
        locked = this;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
      }
      return Promise.resolve();
    };
    Document.prototype.exitPointerLock = function () {
      if (!locked) return;
      locked = null;
      setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
    };
  });
}

/** Windows only: lets the cursor roam the whole screen again (a no-op if nothing is confining it). */
export function releaseCursorClip() {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ClipCursor(IntPtr r);' -Name W -Namespace U; [void][U.W]::ClipCursor([IntPtr]::Zero)",
    ], { stdio: 'ignore', timeout: 20000 });
  } catch {
    // Nothing more can be done from here.
  }
}
