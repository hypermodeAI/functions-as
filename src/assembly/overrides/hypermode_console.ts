// @ts-expect-error: decorator
@external("hypermode", "log")
declare function logToHypermode(level: string, message: string): void;

// @ts-expect-error: decorator
@lazy const timers = new Map<string, u64>();

export default abstract class hypermode_console {
  static assert<T>(condition: T, message: string = ""): void {
    if (!condition) {
      logToHypermode("error", "Assertion failed: " + message);
    }
  }

  static log(message: string = ""): void {
    logToHypermode("", message);
  }

  static debug(message: string = ""): void {
    logToHypermode("debug", message);
  }

  static info(message: string = ""): void {
    logToHypermode("info", message);
  }

  static warn(message: string = ""): void {
    logToHypermode("warning", message);
  }

  static error(message: string = ""): void {
    logToHypermode("error", message);
  }

  static time(label: string = "default"): void {
    const now = process.hrtime();
    if (timers.has(label)) {
      const msg = `Label '${label}' already exists for console.time()`;
      hypermode_console.warn(msg);
      return;
    }
    timers.set(label, now);
  }

  static timeLog(label: string = "default"): void {
    const now = process.hrtime();
    if (!timers.has(label)) {
      const msg = `No such label '${label}' for console.timeLog()`;
      hypermode_console.warn(msg);
      return;
    }
    hypermode_console.timeLogImpl(label, now);
  }

  static timeEnd(label: string = "default"): void {
    const now = process.hrtime();
    if (!timers.has(label)) {
      const msg = `No such label '${label}' for console.timeEnd()`;
      hypermode_console.warn(msg);
      return;
    }
    hypermode_console.timeLogImpl(label, now);
    timers.delete(label);
  }

  private static timeLogImpl(label: string, now: u64): void {
    const start = timers.get(label);
    const nanos = now - start;
    const millis = nanos / 1000000;
    hypermode_console.log(`${label}: ${millis}ms`);
  }
}
