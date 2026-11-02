// Tiny event bus so feature modules talk through events instead of importing each other.
const handlers = new Map();

export const bus = {
  on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, new Set()); handlers.get(evt).add(fn); return () => handlers.get(evt).delete(fn); },
  emit(evt, ...args) { (handlers.get(evt) || []).forEach(fn => fn(...args)); }
};
