// @vitest-environment node
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as web from '@pushizo/web';
import { getBinding } from '../binding.js';
import { PushizoProvider, useNotificationPermission, usePushizoState } from '../index.js';
import type { FakeSdk } from './fake-sdk.js';

vi.mock('@pushizo/web', async () => {
  const { createFakeSdk } = await import('./fake-sdk.js');
  const fake = createFakeSdk();
  return { default: fake.sdk, Pushizo: fake.sdk, __fake: fake };
});

const fake = (web as unknown as { __fake: FakeSdk }).__fake;

describe('@pushizo/react SSR', () => {
  it('sunucuda init çağrılmaz, gözlemci bağlanmaz ve sabit durum çizilir', () => {
    function Probe() {
      const state = usePushizoState();
      const permission = useNotificationPermission();
      return createElement('span', null, `${state.ready}:${permission}`);
    }
    const html = renderToString(
      createElement(PushizoProvider, { options: { appId: 'app_ssr' } }, createElement(Probe)),
    );
    expect(html).toBe('<span>false:default</span>');
    expect(fake.sdk.init).not.toHaveBeenCalled();
    expect(fake.counts()).toEqual({ permission: 0, subscription: 0, click: 0 });
  });

  it('bağlama sunucuda no-op: init çözülür, connect gözlemci eklemez', async () => {
    const binding = getBinding();
    await expect(binding.init({ appId: 'app_ssr' })).resolves.toBeUndefined();
    const off = binding.connect();
    off();
    expect(fake.sdk.init).not.toHaveBeenCalled();
    expect(binding.connectionCount).toBe(0);
  });
});
