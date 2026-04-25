import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// expo-file-system's `File`/`Paths` API is native-only. Importing the symbols
// at the top level is fine (the module exists on web), but constructing a
// `new File(Paths.document, ...)` on web throws because the underlying
// `validatePath` is missing. We therefore lazy-load + gate the API so the
// logger can run in memory-only mode on web without crashing.
type ExpoFile = {
  uri: string;
  exists: boolean;
  size: number;
  contentUri?: string;
  create: (opts?: { intermediates?: boolean; overwrite?: boolean }) => void;
  write: (text: string) => void;
  text: () => Promise<string>;
  textSync: () => string;
};

let FileCtor: (new (parent: unknown, name: string) => ExpoFile) | null = null;
let documentPath: unknown = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system') as {
      File: new (parent: unknown, name: string) => ExpoFile;
      Paths: { document: unknown };
    };
    FileCtor = FS.File;
    documentPath = FS.Paths.document;
  } catch {
    FileCtor = null;
    documentPath = null;
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

const LOG_FILE_NAME = 'lodge-app-logs.txt';
const MAX_FILE_BYTES = 1_000_000; // ~1 MB before rotation
const MAX_MEMORY_ENTRIES = 500;
const FLUSH_DEBOUNCE_MS = 250;

function safeStringify(value: unknown): string {
  if (value === undefined) return '';
  try {
    if (value instanceof Error) {
      return JSON.stringify({
        name: value.name,
        message: value.message,
        stack: value.stack,
      });
    }
    const seen = new WeakSet();
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'function') return `[Function ${v.name || 'anon'}]`;
      return v;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

function formatEntry(entry: LogEntry): string {
  const ts = new Date(entry.ts).toISOString();
  const data = entry.data === undefined ? '' : ' ' + safeStringify(entry.data);
  return `${ts} [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}${data}`;
}

class LoggerImpl {
  private memory: LogEntry[] = [];
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private file: ExpoFile | null = null;
  private initialized = false;
  private listeners = new Set<(entry: LogEntry) => void>();
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
  } | null = null;

  constructor() {
    if (FileCtor && documentPath) {
      try {
        this.file = new FileCtor(documentPath, LOG_FILE_NAME);
      } catch {
        this.file = null;
      }
    }
  }

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (this.file) {
      try {
        if (!this.file.exists) {
          this.file.create({ intermediates: true, overwrite: false });
        } else if (this.file.size > MAX_FILE_BYTES) {
          this.file.write(
            `--- log rotated at ${new Date().toISOString()} (previous size: ${this.file.size} bytes) ---\n`,
          );
        }
      } catch {
        // best-effort: file ops may fail in restricted environments
      }
    }

    this.info('Launch', 'Lodge app starting', this.collectLaunchInfo());
    this.patchConsole();
  }

  private collectLaunchInfo(): Record<string, unknown> {
    return {
      platform: Platform.OS,
      platformVersion: Platform.Version,
      isDevice: Device.isDevice,
      brand: Device.brand,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      appVersion: Constants.expoConfig?.version ?? null,
      runtimeVersion: Constants.expoConfig?.runtimeVersion ?? null,
      sdkVersion: Constants.expoConfig?.sdkVersion ?? null,
      executionEnvironment: Constants.executionEnvironment,
      bundleId: Constants.expoConfig?.android?.package ?? Constants.expoConfig?.ios?.bundleIdentifier ?? null,
      appOwnership: Constants.appOwnership ?? 'unknown',
      hermes: typeof (globalThis as any).HermesInternal !== 'undefined',
    };
  }

  private patchConsole(): void {
    if (this.originalConsole) return;
    if (Platform.OS === 'web') return;

    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    const wrap = (level: LogLevel, original: (...args: any[]) => void) => {
      return (...args: any[]) => {
        try {
          const message = args
            .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
            .join(' ');
          this.write(level, 'console', message);
        } catch {
          // never throw from console wrapper
        }
        original(...args);
      };
    };

    console.log = wrap('debug', this.originalConsole.log);
    console.info = wrap('info', this.originalConsole.info);
    console.warn = wrap('warn', this.originalConsole.warn);
    console.error = wrap('error', this.originalConsole.error);
  }

  debug(tag: string, message: string, data?: unknown): void {
    this.write('debug', tag, message, data);
  }

  info(tag: string, message: string, data?: unknown): void {
    this.write('info', tag, message, data);
  }

  warn(tag: string, message: string, data?: unknown): void {
    this.write('warn', tag, message, data);
  }

  error(tag: string, message: string, data?: unknown): void {
    this.write('error', tag, message, data);
  }

  /**
   * Times an async operation and logs start/end (or failure) entries.
   * Returns the original promise's resolved value.
   */
  async time<T>(tag: string, message: string, fn: () => Promise<T>, data?: unknown): Promise<T> {
    const start = Date.now();
    this.debug(tag, `${message} → start`, data);
    try {
      const result = await fn();
      this.debug(tag, `${message} → ok`, { durationMs: Date.now() - start });
      return result;
    } catch (e: any) {
      this.error(tag, `${message} → fail`, {
        durationMs: Date.now() - start,
        error: e?.message ?? String(e),
        stack: e?.stack,
      });
      throw e;
    }
  }

  private write(level: LogLevel, tag: string, message: string, data?: unknown): void {
    const entry: LogEntry = { ts: Date.now(), level, tag, message, data };
    this.memory.push(entry);
    if (this.memory.length > MAX_MEMORY_ENTRIES) {
      this.memory.splice(0, this.memory.length - MAX_MEMORY_ENTRIES);
    }
    this.buffer.push(entry);
    this.notifyListeners(entry);
    this.scheduleFlush();
  }

  private notifyListeners(entry: LogEntry): void {
    if (this.listeners.size === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore listener errors
      }
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushSync();
    }, FLUSH_DEBOUNCE_MS);
  }

  flushSync(): void {
    if (this.buffer.length === 0) return;
    const pending = this.buffer;
    this.buffer = [];
    if (!this.file) {
      // Memory-only mode (e.g. web). Drop the buffer; in-memory ring buffer
      // is still available via getMemoryEntries().
      return;
    }
    try {
      const text = pending.map(formatEntry).join('\n') + '\n';
      let existing = '';
      if (this.file.exists) {
        try {
          existing = this.file.textSync();
        } catch {
          existing = '';
        }
      } else {
        try {
          this.file.create({ intermediates: true, overwrite: false });
        } catch {
          // ignore
        }
      }
      const next = (existing ?? '') + text;
      this.file.write(next);

      // Rotate if file has grown too large.
      if (this.file.size > MAX_FILE_BYTES) {
        const trimmed =
          `--- log rotated at ${new Date().toISOString()} (kept tail) ---\n` +
          next.slice(-MAX_FILE_BYTES / 2);
        this.file.write(trimmed);
      }
    } catch {
      // If the write failed put the entries back so we try again next flush.
      this.buffer = pending.concat(this.buffer);
    }
  }

  getMemoryEntries(): LogEntry[] {
    return [...this.memory];
  }

  async getFileContents(): Promise<string> {
    this.flushSync();
    if (!this.file) {
      // Fallback: synthesize from in-memory ring buffer.
      return this.memory.map(formatEntry).join('\n');
    }
    if (!this.file.exists) return '';
    try {
      return await this.file.text();
    } catch {
      return '';
    }
  }

  getFileUri(): string {
    if (!this.file) return '(memory only — file logging unavailable)';
    return this.file.uri;
  }

  getFileSize(): number {
    if (!this.file) return 0;
    try {
      return this.file.exists ? this.file.size : 0;
    } catch {
      return 0;
    }
  }

  clear(): void {
    this.buffer = [];
    this.memory = [];
    if (this.file) {
      try {
        if (this.file.exists) {
          this.file.write('');
        }
      } catch {
        // ignore
      }
    }
    this.info('Logger', 'Logs cleared by user');
  }

  async share(): Promise<void> {
    this.info('Logger', 'Share requested');
    this.flushSync();

    if (!this.file) {
      // Web fallback: trigger a browser download of the in-memory log.
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const contents = await this.getFileContents();
        if (!contents) {
          throw new Error('No logs available to share yet.');
        }
        const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = LOG_FILE_NAME;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 0);
        return;
      }
      throw new Error('Sharing logs is not supported on this platform.');
    }

    const available = await Sharing.isAvailableAsync().catch(() => false);
    if (!available) {
      throw new Error('Sharing is not available on this device.');
    }

    if (!this.file.exists || this.file.size === 0) {
      throw new Error('No logs available to share yet.');
    }

    const shareUri = Platform.OS === 'android' ? this.file.contentUri || this.file.uri : this.file.uri;

    await Sharing.shareAsync(shareUri, {
      mimeType: 'text/plain',
      dialogTitle: 'Share Lodge App Logs',
      UTI: 'public.plain-text',
    });
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  formatEntry = formatEntry;
}

export const logger = new LoggerImpl();
