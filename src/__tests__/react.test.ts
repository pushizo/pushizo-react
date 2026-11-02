// @vitest-environment happy-dom
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as web from '@pushizo/web';
import { getBinding, resetBinding } from '../binding.js';
import {
  PushizoProvider,
  useNotificationClick,
  useNotificationPermission,
  usePushizo,
  usePushizoState,
  usePushSubscription,
  type PushizoState,
} from '../index.js';
import { CLICK, type FakeSdk } from './fake-sdk.js';

vi.mock('@pushizo/web', async () => {
  const { createFakeSdk } = await import('./fake-sdk.js');
  const fake = createFakeSdk();
  return { default: fake.sdk, Pushizo: fake.sdk, __fake: fake };
});

const fake = (web as unknown as { __fake: FakeSdk }).__fake;
const OPTIONS = { appId: 'app_react_test' };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  fake.reset();
  resetBinding();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

function Probe({
  onState,
}: {
  onState: (s: PushizoState, permission: string, optedIn: boolean) => void;
}) {
  const state = usePushizoState();
  const permission = useNotificationPermission();
  const subscription = usePushSubscription();
  onState(state, permission, subscription.optedIn);
  return createElement('span', null, `${state.ready}:${permission}:${subscription.optedIn}`);
}

describe('@pushizo/react', () => {
  it('StrictMode çift efektinde init yalnızca bir kez çağrılır ve ready olur', async () => {
    await render(
      createElement(
        StrictMode,
        null,
        createElement(
          PushizoProvider,
          { options: OPTIONS },
          createElement(Probe, { onState: () => undefined }),
        ),
      ),
    );
    expect(fake.sdk.init).toHaveBeenCalledTimes(1);
    expect(fake.sdk.init).toHaveBeenCalledWith(OPTIONS);
    expect(container.textContent).toBe('true:default:false');
    // StrictMode bağlantıyı açıp kapatıp yeniden açar; sonunda tek gözlemci kalır.
    expect(fake.counts()).toMatchObject({ permission: 1, subscription: 1 });
  });

  it('yeniden çizimde (yeni options nesnesi) init tekrar çağrılmaz', async () => {
    await render(createElement(PushizoProvider, { options: { appId: 'app_react_test' } }, null));
    await render(createElement(PushizoProvider, { options: { appId: 'app_react_test' } }, null));
    expect(fake.sdk.init).toHaveBeenCalledTimes(1);
  });

  it('izin ve abonelik değişiklikleri hook durumuna yansır', async () => {
    await render(
      createElement(
        PushizoProvider,
        { options: OPTIONS },
        createElement(Probe, { onState: () => undefined }),
      ),
    );
    await act(async () => fake.setPermission('granted'));
    expect(container.textContent).toBe('true:granted:false');
    await act(async () =>
      fake.setSubscription({ id: 'sub_1', token: 'https://push.example.test/1', optedIn: true }),
    );
    expect(container.textContent).toBe('true:granted:true');
    await act(async () => fake.setPermission('denied'));
    expect(container.textContent).toBe('true:denied:true');
  });

  it('init hatası state.error alanına yazılır, söz reddedilmez', async () => {
    fake.failNextInit(new Error('appId gerekli'));
    let last: PushizoState | null = null;
    await render(
      createElement(
        PushizoProvider,
        { options: OPTIONS },
        createElement(Probe, { onState: (s) => (last = s) }),
      ),
    );
    expect(last!.ready).toBe(false);
    expect(last!.error?.message).toBe('appId gerekli');
  });

  it('sökülünce izin/abonelik gözlemcileri ve tıklama dinleyicisi kaldırılır', async () => {
    const onClick = vi.fn();
    function Clicks() {
      useNotificationClick(onClick);
      return null;
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Clicks)));
    expect(fake.counts()).toEqual({ permission: 1, subscription: 1, click: 1 });
    fake.click(CLICK);
    expect(onClick).toHaveBeenCalledWith(CLICK);
    await act(async () => root.render(null));
    expect(fake.counts()).toEqual({ permission: 0, subscription: 0, click: 0 });
    expect(getBinding().connectionCount).toBe(0);
  });

  it('tıklama işleyicisi değişince dinleyici yeniden eklenmeden son işleyici çağrılır', async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Clicks({ handler }: { handler: () => void }) {
      useNotificationClick(handler);
      return null;
    }
    await render(
      createElement(
        PushizoProvider,
        { options: OPTIONS },
        createElement(Clicks, { handler: first }),
      ),
    );
    await render(
      createElement(
        PushizoProvider,
        { options: OPTIONS },
        createElement(Clicks, { handler: second }),
      ),
    );
    fake.click(CLICK);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(fake.counts().click).toBe(1);
  });

  it('usePushizo paylaşılan SDK örneğini döndürür; provider dışında açıklayıcı hata verir', async () => {
    let sdk: unknown;
    function Sdk() {
      sdk = usePushizo();
      return null;
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Sdk)));
    expect(sdk).toBe(fake.sdk);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = createRoot(document.createElement('div'));
    expect(() => act(() => boom.render(createElement(Sdk)))).toThrow('PushizoProvider');
    errors.mockRestore();
  });
});
