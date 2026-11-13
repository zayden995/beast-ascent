/** Creates an element with optional class names and text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function button(className: string, label: string, onClick: () => void, sub = ''): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  if (sub) b.append(el('small', '', sub));
  b.addEventListener('click', onClick);
  return b;
}

/** Writes DOM only when a value actually changes, so per-frame HUD updates stay cheap. */
export class DomCache {
  private last = new Map<string, string>();

  private changed(key: string, value: string): boolean {
    if (this.last.get(key) === value) return false;
    this.last.set(key, value);
    return true;
  }

  text(key: string, node: HTMLElement, value: string): void {
    if (this.changed(key, value)) node.textContent = value;
  }

  width(key: string, node: HTMLElement, fraction: number): void {
    const v = `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%`;
    if (this.changed(key, v)) node.style.width = v;
  }

  height(key: string, node: HTMLElement, fraction: number): void {
    const v = `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(1)}%`;
    if (this.changed(key, v)) node.style.height = v;
  }

  attr(key: string, node: HTMLElement, name: string, value: string): void {
    if (this.changed(key, value)) node.setAttribute(name, value);
  }

  cls(key: string, node: HTMLElement, name: string, on: boolean): void {
    if (this.changed(key, on ? '1' : '0')) node.classList.toggle(name, on);
  }

  hidden(key: string, node: HTMLElement, hidden: boolean): void {
    if (this.changed(key, hidden ? '1' : '0')) node.hidden = hidden;
  }
}
