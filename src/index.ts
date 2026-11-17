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
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  ContentCardsViewHandle,
  ContentCardsViewOptions,
  ForegroundLifecycleEvent,
  InboxChangeEvent,
  InitOptions,
  NotificationClickEvent,
  PermissionState,
  PushSubscriptionState,
  PushizoSdk,
  SearchQueryOptions,
  SearchResponse,
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

/**
 * Ön plan bildirimi dinleyicisi (`event.preventDefault()` ile bildirim engellenebilir). İşleyici her çizimde
 * değişebilir; dinleyici bileşen sökülünce `Notifications.removeForegroundLifecycleListener` ile kaldırılır.
 */
export function useNotificationForeground(
  handler: (event: ForegroundLifecycleEvent) => void,
): void {
  const binding = useBinding('useNotificationForeground');
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);
  useEffect(() => {
    const listener = (event: ForegroundLifecycleEvent) => latest.current(event);
    binding.sdk.Notifications.addForegroundLifecycleListener(listener);
    return () => binding.sdk.Notifications.removeForegroundLifecycleListener(listener);
  }, [binding]);
}

/** Özellik bayrağı aboneliği: gözlemci bileşen sökülünce `FeatureFlags.removeObserver` ile kaldırılır. */
function useFlagSnapshot<T>(hook: string, read: (sdk: PushizoSdk) => T, fallback: T): T {
  const binding = useBinding(hook);
  const subscribe = useCallback(
    (onChange: () => void) => {
      binding.sdk.FeatureFlags.addObserver(onChange);
      return () => binding.sdk.FeatureFlags.removeObserver(onChange);
    },
    [binding],
  );
  // `ready` izlenir: bayraklar `init` tamamlanınca önbellekten okunabilir hâle gelir.
  const ready = useSyncExternalStore(
    binding.subscribe,
    () => binding.getState().ready,
    () => false,
  );
  const value = useSyncExternalStore(
    subscribe,
    () => read(binding.sdk),
    () => fallback,
  );
  return ready ? value : fallback;
}

/**
 * Özellik bayrağı açık mı. Değerler sunucudan yenilendiğinde bileşen yeniden çizilir; SDK hazır olana kadar ve
 * sunucuda `defaultValue` döner.
 */
export function useFeatureFlag(key: string, defaultValue = false): boolean {
  return useFlagSnapshot(
    'useFeatureFlag',
    (sdk) => sdk.FeatureFlags.isEnabled(key, defaultValue),
    defaultValue,
  );
}

/**
 * Özellik bayrağının değeri (metin, sayı, mantıksal). Nesne değerli bayraklarda her yenilemede yeni başvuru
 * dönebileceği için ilkel değerlerle kullanın; bayrak kapalıysa `defaultValue` döner.
 */
export function useFeatureFlagValue<T = unknown>(key: string, defaultValue?: T): T | undefined {
  return useFlagSnapshot(
    'useFeatureFlagValue',
    (sdk) => sdk.FeatureFlags.getValue<T>(key, defaultValue),
    defaultValue,
  );
}

/**
 * Bildirim kutusundaki okunmamış sayısı (rozet için). SDK hazır olunca bir kez sunucudan okunur, sonra
 * `Inbox.addObserver` olaylarıyla güncellenir; henüz bilinmiyorsa (ya da okuma başarısızsa) `null`.
 */
export function useInboxUnreadCount(): number | null {
  const binding = useBinding('useInboxUnreadCount');
  const ready = useSelected('useInboxUnreadCount', (s) => s.ready);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    const observer = (event: InboxChangeEvent) => setCount(event.unreadCount);
    binding.sdk.Inbox.addObserver(observer);
    binding.sdk.Inbox.unreadCount().then(
      (value) => {
        if (active) setCount(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
      binding.sdk.Inbox.removeObserver(observer);
    };
  }, [binding, ready]);
  return count;
}

export interface PushizoContentCardsProps {
  /** `ContentCards.render` seçenekleri; yalnızca ilk değer kullanılır (görünüm bir kez kurulur). */
  options?: ContentCardsViewOptions;
  className?: string;
  style?: CSSProperties;
  /** Görünüm kurulamazsa (ör. betik yüklenemedi) çağrılır. */
  onError?: (error: Error) => void;
}

/**
 * Hazır içerik kartı akışı: SDK hazır olunca `ContentCards.render` ile kendi `<div>` öğesine çizilir
 * (yükleniyor/boş/hata durumları görünümdedir) ve bileşen sökülünce kaldırılır. Sunucuda boş `<div>` çizer.
 */
export function PushizoContentCards({
  options,
  className,
  style,
  onError,
}: PushizoContentCardsProps) {
  const binding = useBinding('PushizoContentCards');
  const ready = useSelected('PushizoContentCards', (s) => s.ready);
  const host = useRef<HTMLDivElement | null>(null);
  const first = useRef({ options, onError });
  useEffect(() => {
    first.current.onError = onError;
  }, [onError]);
  useEffect(() => {
    const element = host.current;
    if (!ready || !element) return undefined;
    let active = true;
    let handle: ContentCardsViewHandle | null = null;
    binding.sdk.ContentCards.render(element, first.current.options).then(
      (view) => {
        // Kurulum bitmeden sökülen (StrictMode çift efekti dahil) görünüm hemen kaldırılır.
        if (active) handle = view;
        else view.destroy();
      },
      (err: unknown) => {
        if (active) first.current.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      active = false;
      handle?.destroy();
    };
  }, [binding, ready]);
  return createElement('div', { ref: host, className, style });
}

export interface PushizoSearchState {
  /** Son tamamlanan aramanın yanıtı (sonuçlar, varsa AI yanıtı); henüz arama yoksa `null`. */
  response: SearchResponse | null;
  loading: boolean;
  error: Error | null;
  /** Arama yapar; boş metin durumu temizler. Art arda çağrılarda yalnızca son aramanın yanıtı yazılır. */
  search: (text: string, options?: SearchQueryOptions) => Promise<void>;
  /** Sonuç tıklamasını kaydeder (`Search.trackClick`); arama yapılmadıysa hiçbir şey yapmaz. */
  trackClick: (url: string, position?: number) => void;
  reset: () => void;
}

/** Site araması: kendi arama kutunuz için `Search.query` durumunu (yanıt, yükleniyor, hata) yönetir. */
export function usePushizoSearch(): PushizoSearchState {
  const binding = useBinding('usePushizoSearch');
  const [state, setState] = useState<Pick<PushizoSearchState, 'response' | 'loading' | 'error'>>({
    response: null,
    loading: false,
    error: null,
  });
  const sequence = useRef(0);
  const queryId = useRef<string | null>(null);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  const reset = useCallback(() => {
    sequence.current += 1;
    queryId.current = null;
    setState({ response: null, loading: false, error: null });
  }, []);
  const search = useCallback(
    async (text: string, options?: SearchQueryOptions) => {
      if (!text.trim()) {
        reset();
        return;
      }
      const current = (sequence.current += 1);
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await binding.sdk.Search.query(text, options);
        if (current !== sequence.current) return;
        queryId.current = response.query_id;
        setState({ response, loading: false, error: null });
      } catch (err) {
        if (current !== sequence.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    },
    [binding, reset],
  );
  const trackClick = useCallback(
    (url: string, position?: number) => {
      if (queryId.current) void binding.sdk.Search.trackClick(queryId.current, url, position);
    },
    [binding],
  );
  return { ...state, search, trackClick, reset };
}
