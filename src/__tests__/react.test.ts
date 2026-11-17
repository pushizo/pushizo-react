// @vitest-environment happy-dom
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as web from '@pushizo/web';
import { getBinding, resetBinding } from '../binding.js';
import {
  PushizoContentCards,
  PushizoProvider,
  useFeatureFlag,
  useFeatureFlagValue,
  useInboxUnreadCount,
  useNotificationClick,
  useNotificationForeground,
  useNotificationPermission,
  usePushizo,
  usePushizoSearch,
  usePushizoState,
  usePushSubscription,
  type PushizoSearchState,
  type PushizoState,
} from '../index.js';
import { CLICK, FOREGROUND, searchResponse, type FakeSdk } from './fake-sdk.js';

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

  it('ön plan dinleyicisi sökülünce removeForegroundLifecycleListener ile kaldırılır', async () => {
    const onForeground = vi.fn();
    function Foreground() {
      useNotificationForeground(onForeground);
      return null;
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Foreground)));
    expect(fake.extraCounts().foreground).toBe(1);
    fake.foreground(FOREGROUND);
    expect(onForeground).toHaveBeenCalledWith(FOREGROUND);
    await act(async () => root.render(null));
    expect(fake.extraCounts().foreground).toBe(0);
    expect(fake.sdk.Notifications.removeForegroundLifecycleListener).toHaveBeenCalledTimes(1);
  });

  it('useFeatureFlag bayrak yenilenince yeniden çizer; gözlemci removeObserver ile temizlenir', async () => {
    function Flags() {
      const enabled = useFeatureFlag('new_checkout');
      const limit = useFeatureFlagValue<number>('limit', 5);
      return createElement('span', null, `${enabled}:${limit}`);
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Flags)));
    expect(container.textContent).toBe('false:5');
    expect(fake.extraCounts().flags).toBe(2);
    await act(async () =>
      fake.setFlags({ new_checkout: { enabled: true }, limit: { enabled: true, value: 20 } }),
    );
    expect(container.textContent).toBe('true:20');
    await act(async () => root.render(null));
    expect(fake.extraCounts().flags).toBe(0);
    expect(fake.sdk.FeatureFlags.removeObserver).toHaveBeenCalledTimes(2);
  });

  it('useInboxUnreadCount ilk değeri okur, kutu olaylarıyla güncellenir ve gözlemciyi kaldırır', async () => {
    fake.setUnread(3);
    function Badge() {
      const count = useInboxUnreadCount();
      return createElement('span', null, String(count));
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Badge)));
    expect(container.textContent).toBe('3');
    expect(fake.sdk.Inbox.unreadCount).toHaveBeenCalledTimes(1);
    await act(async () => fake.inbox({ type: 'read', itemId: 'in_1', unreadCount: 2 }));
    expect(container.textContent).toBe('2');
    await act(async () => root.render(null));
    expect(fake.extraCounts().inbox).toBe(0);
  });

  it('PushizoContentCards hazır olunca görünümü kurar, sökülünce kaldırır (StrictMode dahil)', async () => {
    const options = { theme: 'dark' as const };
    await render(
      createElement(
        StrictMode,
        null,
        createElement(
          PushizoProvider,
          { options: OPTIONS },
          createElement(PushizoContentCards, { options, className: 'cards' }),
        ),
      ),
    );
    const host = container.querySelector('div.cards');
    expect(host).not.toBeNull();
    expect(fake.sdk.ContentCards.render).toHaveBeenLastCalledWith(host, options);
    expect(fake.extraCounts().cardViews).toBe(1);
    await act(async () => root.render(null));
    expect(fake.extraCounts().cardViews).toBe(0);
  });

  it('PushizoContentCards kurulum hatasını onError ile bildirir', async () => {
    fake.sdk.ContentCards.render.mockRejectedValueOnce(new Error('betik yüklenemedi'));
    const onError = vi.fn();
    await render(
      createElement(
        PushizoProvider,
        { options: OPTIONS },
        createElement(PushizoContentCards, { onError }),
      ),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe('betik yüklenemedi');
  });

  it('usePushizoSearch yanıtı, hatayı ve tıklama kaydını yönetir; eski yanıt yenisinin üzerine yazmaz', async () => {
    let api!: PushizoSearchState;
    function Search() {
      api = usePushizoSearch();
      return createElement('span', null, `${api.loading}:${api.response?.query_id ?? '-'}`);
    }
    await render(createElement(PushizoProvider, { options: OPTIONS }, createElement(Search)));
    api.trackClick('https://example.test/doc');
    expect(fake.sdk.Search.trackClick).not.toHaveBeenCalled();

    await act(async () => api.search('fiyat', { limit: 3 }));
    expect(fake.sdk.Search.query).toHaveBeenCalledWith('fiyat', { limit: 3 });
    expect(container.textContent).toBe('false:q_fiyat');
    api.trackClick('https://example.test/doc', 1);
    expect(fake.sdk.Search.trackClick).toHaveBeenCalledWith(
      'q_fiyat',
      'https://example.test/doc',
      1,
    );

    // Yavaş ilk arama, hızlı ikinci aramadan sonra dönse de yok sayılır.
    let releaseSlow!: () => void;
    fake.searchWith((text) =>
      text === 'yavaş'
        ? new Promise((resolve) => {
            releaseSlow = () => resolve(searchResponse(text));
          })
        : Promise.resolve(searchResponse(text)),
    );
    await act(async () => {
      void api.search('yavaş');
      await api.search('hızlı');
      releaseSlow();
    });
    expect(container.textContent).toBe('false:q_hızlı');

    fake.searchWith(() => Promise.reject(new Error('arama kapalı')));
    await act(async () => api.search('hata'));
    expect(api.error?.message).toBe('arama kapalı');
    expect(api.loading).toBe(false);

    await act(async () => api.search('  '));
    expect(api.response).toBeNull();
    expect(api.error).toBeNull();
  });
});
