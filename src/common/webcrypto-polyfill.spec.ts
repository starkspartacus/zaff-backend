describe('Web Crypto pour Node 18 (signature UploadThing)', () => {
  it('installe globalThis.crypto.subtle quand il manque', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    jest.isolateModules(() => require('./webcrypto-polyfill'));
    expect(typeof (globalThis as any).crypto?.subtle?.importKey).toBe('function');
    if (original) Object.defineProperty(globalThis, 'crypto', original);
  });
});
