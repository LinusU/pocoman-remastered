import { parsePocomanMap, type PocomanData } from './pocomap';
import './ui.css';

// The dropped file is kept in this browser's IndexedDB (it holds about a
// megabyte of sound, too much for localStorage), so later visits start
// without dropping it again. It never leaves the browser.
const DB_NAME = 'pocoman';
const STORE = 'files';
const FILE_KEY = 'POCOMAN.MAP';

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

async function loadSavedFile(): Promise<PocomanData | null> {
  try {
    const buffer = await withStore<ArrayBuffer | undefined>('readonly', (s) => s.get(FILE_KEY));
    return buffer ? parsePocomanMap(buffer) : null;
  } catch {
    return null;
  }
}

function saveFile(buffer: ArrayBuffer): Promise<unknown> {
  return withStore('readwrite', (s) => s.put(buffer, FILE_KEY)).catch(() => {
    // Not critical; the file just has to be dropped again next time.
  });
}

/** The stored POCOMAN.MAP, or asks for one if there isn't any yet. */
export async function loadMapData(): Promise<PocomanData> {
  return (await loadSavedFile()) ?? (await showDropScreen(false))!;
}

/**
 * Asks for POCOMAN.MAP (drag and drop, or a file picker) and resolves with
 * its levels and sounds, or null if cancelled. The file is stored for next
 * time.
 */
export function showDropScreen(cancellable: boolean): Promise<PocomanData | null> {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'ui-layer';
    layer.innerHTML = `
      <div class="view">
        <div class="logo">PocoMan<small>REMASTERED</small></div>
        <div class="panel">
          <label class="drop-zone">
            <span class="big">Drop POCOMAN.MAP here</span>
            <span class="small">or click to choose the file from your copy of PocoMan</span>
            <input type="file" accept=".map,.MAP" hidden />
          </label>
          <div class="error"></div>
          ${cancellable ? '<button class="btn cancel" style="align-items:center">Cancel</button>' : ''}
        </div>
      </div>`;
    document.body.appendChild(layer);

    const drop = layer.querySelector<HTMLElement>('.drop-zone')!;
    const fileInput = layer.querySelector<HTMLInputElement>('input[type=file]')!;
    const error = layer.querySelector<HTMLElement>('.error')!;

    let done = false;
    const finish = (data: PocomanData | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKey);
      layer.remove();
      resolve(data);
    };

    const readFile = async (file: File) => {
      error.textContent = '';
      try {
        const buffer = await file.arrayBuffer();
        const data = parsePocomanMap(buffer);
        await saveFile(buffer);
        finish(data);
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
      }
    };

    // Accept drops anywhere on the page, not just on the box.
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      drop.classList.add('over');
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      drop.classList.remove('over');
      const file = e.dataTransfer?.files[0];
      if (file) readFile(file);
    };
    const onKey = (e: KeyboardEvent) => {
      if (cancellable && e.key === 'Escape') finish(null);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKey);
    layer.addEventListener('dragleave', (e) => {
      if (e.target === layer) drop.classList.remove('over');
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) readFile(file);
    });
    layer.querySelector('.cancel')?.addEventListener('click', () => finish(null));
  });
}
