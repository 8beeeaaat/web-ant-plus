// Folk: https://github.com/deno-library/events/blob/master/mod.ts
// biome-ignore lint/suspicious/noExplicitAny: no-explicit-any
type AnyFunction = (...args: any[]) => any;

export interface WrappedFunction extends AnyFunction {
  listener: AnyFunction;
}

export class EventEmitter {
  private events: Map<string, Array<AnyFunction>> = new Map();
  private warned: Map<string, boolean> = new Map();
  private maxListeners?: number;

  #defaultMaxListeners = 10;

  get defaultMaxListeners() {
    return this.#defaultMaxListeners;
  }

  set defaultMaxListeners(n) {
    if (Number.isInteger(n) || n < 0) {
      const error = new RangeError(
        `The value of "defaultMaxListeners" is out of range. It must be a non-negative integer. Received ${n}.`,
      );
      throw error;
    }
    this.#defaultMaxListeners = n;
  }

  addListener(eventName: string, listener: AnyFunction) {
    return this.on(eventName, listener);
  }

  emit(eventName: string, ...args: unknown[]) {
    const listeners = this.events.get(eventName);
    if (listeners === undefined) {
      if (eventName === "error") {
        const error = args[0];

        if (error instanceof Error) throw error;

        throw new Error("Unhandled error.");
      }
      return false;
    }
    const copyListeners = [...listeners];
    for (const listener of copyListeners) {
      listener.apply(this, args);
    }

    return true;
  }

  setMaxListeners(n: number) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(
        `The value of "n" is out of range. It must be a non-negative integer. Received ${n}.`,
      );
    }
    this.maxListeners = n;
    return this;
  }

  getMaxListeners() {
    if (this.maxListeners === undefined) {
      return this.defaultMaxListeners;
    }
    return this.maxListeners;
  }

  listenerCount(eventName: string) {
    const events = this.events.get(eventName);
    return events === undefined ? 0 : events.length;
  }

  eventNames() {
    return Reflect.ownKeys(this.events);
  }

  listeners(eventName: string) {
    const listeners = this.events.get(eventName);
    return listeners === undefined ? [] : listeners;
  }

  off(eventName: string, listener: AnyFunction) {
    return this.removeListener(eventName, listener);
  }

  on(eventName: string, listener: AnyFunction, prepend?: boolean): this {
    if (this.events.has(eventName) === false) {
      this.events.set(eventName, []);
    }
    const events = this.events.get(eventName);
    if (events === undefined) {
      throw new Error("events is undefined");
    }
    if (prepend) {
      events.unshift(listener);
    } else {
      events.push(listener);
    }

    // newListener
    if (eventName !== "newListener" && this.events.has("newListener")) {
      this.emit("newListener", eventName, listener);
    }

    // warn
    const warned = this.warned.get(eventName);
    const maxListener = this.getMaxListeners();
    const eventLength = events.length;
    if (maxListener > 0 && eventLength > maxListener && !warned) {
      this.warned.set(eventName, true);
      const warning = new Error(
        `Possible EventEmitter memory leak detected.
         ${this.listenerCount(eventName)} ${eventName.toString()} listeners.
         Use emitter.setMaxListeners() to increase limit`,
      );
      warning.name = "MaxListenersExceededWarning";
      console.warn(warning);
    } else {
      this.warned.set(eventName, false);
    }

    return this;
  }

  removeAllListeners(eventName: string) {
    const { events } = this;

    // Not listening for removeListener, no need to emit
    if (!events.has("removeListener")) {
      if (eventName.length === 0) {
        this.events = new Map();
      } else if (events.has(eventName)) {
        events.delete(eventName);
      }
      return this;
    }

    // Emit removeListener for all listeners on all events
    if (eventName.length === 0) {
      for (const key of events.keys()) {
        if (key !== "removeListener") {
          this.removeAllListeners(key);
        }
      }
      this.removeAllListeners("removeListener");
      this.events = new Map();
      return this;
    }

    const listeners = events.get(eventName);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        this.removeListener(eventName, listener);
      }
    }

    return this;
  }

  removeListener(eventName: string, listener: AnyFunction) {
    const { events } = this;
    if (events.size === 0) return this;

    const list = events.get(eventName);
    if (list === undefined) return this;

    const index = list.findIndex(
      (item) =>
        item === listener || (item as WrappedFunction).listener === listener,
    );

    if (index === -1) return this;

    list.splice(index, 1);
    if (list.length === 0) this.events.delete(eventName);

    if (events.has("removeListener")) {
      this.emit("removeListener", eventName, listener);
    }

    return this;
  }

  once(eventName: string, listener: AnyFunction): this {
    this.on(eventName, this.onceWrap(eventName, listener));
    return this;
  }

  private onceWrap(eventName: string, listener: AnyFunction): WrappedFunction {
    const wrapper = function (
      this: {
        eventName: string;
        listener: AnyFunction;
        wrapedListener: AnyFunction;
        context: EventEmitter;
      },
      // biome-ignore lint/suspicious/noExplicitAny: no-explicit-any
      ...args: any[]
    ): void {
      this.context.removeListener(this.eventName, this.wrapedListener);
      this.listener.apply(this.context, args);
    };
    const wrapperContext = {
      eventName,
      listener,
      wrapedListener: wrapper as unknown as WrappedFunction,
      context: this,
    };
    const wrapped = wrapper.bind(wrapperContext) as unknown as WrappedFunction;
    wrapperContext.wrapedListener = wrapped;
    wrapped.listener = listener;
    return wrapped;
  }

  prependListener(eventName: string, listener: AnyFunction) {
    return this.on(eventName, listener, true);
  }

  prependOnceListener(eventName: string, listener: AnyFunction) {
    this.prependListener(eventName, this.onceWrap(eventName, listener));
    return this;
  }

  rawListeners(eventName: string) {
    const { events } = this;
    if (events === undefined) return [];
    const listeners = events.get(eventName);
    if (listeners === undefined) return [];
    return [...listeners];
  }
}
