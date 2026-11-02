<!-- pushizo:header -->
<p align="center">
  <a href="https://pushizo.com"><img src="https://raw.githubusercontent.com/pushizo/.github/main/profile/assets/mark.svg" alt="Pushizo" width="56" height="56"></a>
</p>
<p align="center">
  <a href="https://docs.pushizo.com/docs/integrations/react"><img src="https://img.shields.io/badge/docs-docs.pushizo.com-5b4bdb" alt="Docs"></a>
  <a href="https://docs.pushizo.com/docs/api"><img src="https://img.shields.io/badge/API-reference-b44fc4" alt="API reference"></a>
  <a href="https://github.com/pushizo/pushizo-react/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-16130f" alt="License: MIT"></a>
</p>
<p align="center"><a href="#english">English</a> · <a href="#türkçe">Türkçe</a></p>

## English

**Pushizo for React** — React bindings for the Pushizo Web SDK. PushizoProvider initializes the shared SDK once in the browser (SSR safe, no double init under StrictMode); usePushizo returns the SDK, and hooks expose the notification permission and push subscription state from the SDK observers. React 18 and 19, Next.js App Router ready.

> **Status:** @pushizo/react 0.1.0 is not on npm yet; until then you can install the release archive from this repository.<br>
> **Durum:** @pushizo/react 0.1.0 henüz npm'de değil; o zamana kadar bu deponun sürüm arşivinden kurabilirsiniz.

**Install from GitHub until then · O zamana kadar GitHub'dan kurulum:**

```bash
npm install @pushizo/web --allow-remote=root https://github.com/pushizo/pushizo-react/releases/download/v0.1.0/pushizo-react-0.1.0.tgz
```

**After publication · Yayından sonra:**

```bash
npm install @pushizo/react @pushizo/web
```

The detailed guide below is in Turkish; code samples are language-neutral. Full documentation:
[docs.pushizo.com/docs/integrations/react](https://docs.pushizo.com/docs/integrations/react) · API reference: [docs.pushizo.com/docs/api](https://docs.pushizo.com/docs/api).

## Türkçe
<!-- /pushizo:header -->

# @pushizo/react

Pushizo Web SDK'sı (`@pushizo/web`) için React bağlamaları: tek bir `PushizoProvider` paylaşılan SDK örneğini
tarayıcıda bir kez başlatır, hook'lar izin ve push abonelik durumunu web SDK'nın gözlemcilerinden okur.

- SSR güvenli: sunucuda (Next.js, Remix) `init` çağrılmaz, gözlemci bağlanmaz; hidrasyon sabit bir başlangıç durumuyla yapılır.
- React StrictMode'un geliştirmedeki çift efekti SDK'yı ikinci kez başlatmaz.
- Bileşen sökülünce izin/abonelik gözlemcileri ve tıklama dinleyicileri kaldırılır.
- React 18 ve 19 (`useSyncExternalStore`); Next.js App Router için paket `'use client'` ile işaretlidir.

## Kurulum

```bash
npm install @pushizo/react @pushizo/web
```

Service worker site kökünde olmalıdır (`public/PushizoSDKWorker.js`):

```js
// public/PushizoSDKWorker.js
const apiUrl = new URL(self.location.href).searchParams.get('apiUrl') || 'https://api.pushizo.com';
importScripts(`${apiUrl.replace(/\/$/, '')}/sdk-web/PushizoSDKWorker.js`);
```

## Kullanım

```tsx
// main.tsx (Vite) veya app/providers.tsx (Next.js, 'use client')
import { PushizoProvider } from '@pushizo/react';

const options = { appId: 'app_…', serviceWorkerPath: '/PushizoSDKWorker.js' };

export function Providers({ children }: { children: React.ReactNode }) {
  return <PushizoProvider options={options}>{children}</PushizoProvider>;
}
```

```tsx
import { useNotificationPermission, usePushizo, usePushizoState, usePushSubscription } from '@pushizo/react';

export function PushToggle() {
  const pushizo = usePushizo();
  const { ready, error } = usePushizoState();
  const permission = useNotificationPermission(); // 'default' | 'granted' | 'denied' | 'unsupported'
  const subscription = usePushSubscription(); // { id, token, optedIn, permission }

  if (error) return <p role="alert">{error.message}</p>;
  if (!ready) return <p>Yükleniyor…</p>;
  if (permission === 'unsupported') return <p>Bu tarayıcı web push desteklemiyor.</p>;
  if (permission === 'denied') return <p>Bildirimler tarayıcı ayarlarından engellenmiş.</p>;
  return subscription.optedIn ? (
    <button onClick={() => void pushizo.User.pushSubscription.optOut()}>Bildirimleri kapat</button>
  ) : (
    <button onClick={() => void pushizo.Notifications.requestPermission()}>Bildirimlere izin ver</button>
  );
}
```

Bildirim tıklaması:

```tsx
import { useNotificationClick } from '@pushizo/react';

useNotificationClick(({ notification, result }) => {
  router.push(result.url ?? notification.url ?? '/');
});
```

## API

| Ad | Açıklama |
|----|----------|
| `<PushizoProvider options>` | `Pushizo.init(options)` çağrısını tarayıcıda bir kez yapar; yalnızca ilk `options` kullanılır. |
| `usePushizo()` | Paylaşılan SDK örneği: `login`, `logout`, `User.addTags`, `Session.sendEvent`, `Inbox` … |
| `usePushizoState()` | `{ ready, error, permission, pushSubscription }` |
| `useNotificationPermission()` | Tarayıcı bildirim izni. |
| `usePushSubscription()` | Push abonelik durumu. |
| `useNotificationClick(handler)` | Bildirim tıklaması dinleyicisi; sökülünce kaldırılır. |

`init` hatası (ör. eksik `appId`) fırlatılmaz, `usePushizoState().error` alanına yazılır. Hook'lar provider dışında
açıklayıcı bir hata verir. SDK'nın tüm yüzeyi için [Web SDK rehberi](https://docs.pushizo.com/docs/sdk/web).

Ayrıntılı rehber (login/logout, tag ve olaylar, bildirim kutusu, Next.js): [React rehberi](https://docs.pushizo.com/docs/integrations/react).

<!-- pushizo:footer -->
---

## Support · Destek

- **Guide · Rehber:** [docs.pushizo.com/docs/integrations/react](https://docs.pushizo.com/docs/integrations/react)
- **API reference & OpenAPI · API referansı ve OpenAPI:** [docs.pushizo.com/docs/api](https://docs.pushizo.com/docs/api) ·
  [pushizo-openapi](https://github.com/pushizo/pushizo-openapi)
- **Bugs & ideas · Hata ve öneri:** [Issues](https://github.com/pushizo/pushizo-react/issues)
- **Security · Güvenlik:** please do not open public issues; email [security@pushizo.com](mailto:security@pushizo.com) ·
  herkese açık issue açmayın, bu adrese yazın.
- **Help · Destek:** [support@pushizo.com](mailto:support@pushizo.com)

This repository is mirrored automatically from the Pushizo main repository on every release. Please open an issue
instead of a pull request; fixes land in the main repository and ship with the next release.
Bu depo her sürümde Pushizo ana deposundan otomatik yansıtılır. Pull request yerine issue açın; düzeltmeler ana depoda
yapılır ve bir sonraki sürümle buraya gelir.

Released under the MIT License · MIT lisanslıdır — [LICENSE](https://github.com/pushizo/pushizo-react/blob/main/LICENSE).
<!-- /pushizo:footer -->
