'use client';
/**
 * @pushizo/react — Pushizo Web SDK'sı (`@pushizo/web`) için React bağlamaları.
 *
 * `PushizoProvider` paylaşılan SDK örneğini tarayıcıda bir kez başlatır (SSR'de ve StrictMode'un çift efektinde
 * güvenli); hook'lar izin ve push abonelik durumunu web SDK'nın gözlemcilerinden okur.
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  InitOptions,
  NotificationClickEvent,
  PermissionState,
  PushSubscriptionState,
  PushizoSdk,
} from '@pushizo/web';
import { getBinding, SERVER_STATE, type PushizoBinding, type PushizoState } from './binding.js';

export type { PushizoState } from './binding.js';

const PushizoContext = createContext<PushizoBinding | null>(null);
PushizoContext.displayName = 'PushizoContext';

export interface PushizoProviderProps {
  /** `Pushizo.init` seçenekleri; yalnızca ilk değer kullanılır (SDK bir kez başlatılır). */
  options: InitOptions;
  children?: ReactNode;
}

/**
 * Uygulamanın köküne yerleştirilir. Tarayıcıda `Pushizo.init(options)` çağrısını bir kez yapar ve durum
 * gözlemcilerini bağlar; sökülünce gözlemcileri kaldırır. Sunucuda hiçbir şey yapmaz.
 */
export function PushizoProvider({ options, children }: PushizoProviderProps) {
  const binding = getBinding();

  useEffect(() => binding.connect(), [binding]);

  useEffect(() => {
    void binding.init(options);
  }, [binding, options]);

  return createElement(PushizoContext.Provider, { value: binding }, children);
}

function useBinding(hook: string): PushizoBinding {
  const binding = useContext(PushizoContext);
  if (!binding) throw new Error(`${hook}: bileşen <PushizoProvider> içinde olmalı.`);
  return binding;
}

function useSelected<T>(hook: string, select: (state: PushizoState) => T): T {
  const binding = useBinding(hook);
  return useSyncExternalStore(
    binding.subscribe,
    () => select(binding.getState()),
    () => select(SERVER_STATE),
  );
}

/** Paylaşılan Pushizo SDK örneği (`login`, `User.addTags`, `Notifications.requestPermission` …). */
export function usePushizo(): PushizoSdk {
  return useBinding('usePushizo').sdk;
}

/** Tüm durum: `ready`, `error`, `permission`, `pushSubscription`. */
export function usePushizoState(): PushizoState {
  return useSelected('usePushizoState', (s) => s);
}

/** Tarayıcı bildirim izni: `default` | `granted` | `denied` | `unsupported`. */
export function useNotificationPermission(): PermissionState {
  return useSelected('useNotificationPermission', (s) => s.permission);
}

/** Push abonelik durumu (`id`, `token`, `optedIn`, `permission`). */
export function usePushSubscription(): PushSubscriptionState {
  return useSelected('usePushSubscription', (s) => s.pushSubscription);
}

/**
 * Bildirim tıklaması dinleyicisi. İşleyici her çizimde değişebilir; dinleyici yalnızca bağlanırken eklenir ve
 * bileşen sökülünce kaldırılır.
 */
export function useNotificationClick(handler: (event: NotificationClickEvent) => void): void {
  const binding = useBinding('useNotificationClick');
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);
  useEffect(() => {
    const remove = binding.sdk.Notifications.addClickListener((event) => latest.current(event));
    return () => {
      remove();
    };
  }, [binding]);
}
