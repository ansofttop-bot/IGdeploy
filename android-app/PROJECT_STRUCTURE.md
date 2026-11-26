# IGseek Native Android App (`android-app/`)

Самостоятельное нативное Android-приложение экосистемы **IGseek**, написанное на **Kotlin + Jetpack Compose + Material 3** (полностью без WebView).

## Технологический стек

- **Язык:** Kotlin 2.0.21 (JVM 17), Android SDK 35 (`minSdk 26`).
- **UI:** Jetpack Compose (BOM `2024.10.01`) + Material 3, единая визуальная идентичность IGseek (тёмная/светлая тема и 9 цветовых акцентов).
- **Архитектура:** MVVM / UDF (`IGseekViewModel` + `StateFlow<IGseekUiState>`).
- **Сеть:** `OkHttp 4.12` с потоковым SSE (`/api/chat`), presigned S3 загрузками (`/api/library`), `Idempotency-Key` и Firebase Auth REST.
- **Безопасность и офлайн:**
  - `SQLiteOpenHelper` (`LocalStore.kt`) — локальный кэш чатов, Library, Memory и **офлайн-очередь отправки (`outbox`)**.
  - `EncryptedSharedPreferences` (Android Keystore AES256-GCM) — шифрование токенов сессии.
  - `BiometricPrompt` — опциональная биометрическая защита входа.
  - `Chrome Custom Tabs` — безопасный платёжный флоу без WebView.

## Мобильные функции (сверх веб-версии)

1. Офлайн-кэш + автоматическая синхронизация очереди сообщений (`Outbox`) при возвращении сети.
2. Приём текста, фото и файлов из других приложений Android через системное меню «Поделиться» (`ACTION_SEND`) — с выбором «В Чат» или «В Library».
3. Домашний виджет быстрого запуска (`IGseekQuickWidget`) — мгновенный переход в Чат, Flow или Library.
4. Биометрическая блокировка входа.
5. Конструктор мобильного интерфейса: порядок вкладок нижней навигации, компактная плотность чата, быстрые подсказки, тактильный отклик, 9 акцентов.
6. Переключение URL backend-сервера прямо в настройках без пересборки APK.

## Структура проекта

```text
android-app/
├── PROJECT_STRUCTURE.md
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── builds/
│   └── IGseek-v2.0-native-debug.apk
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── res/
        │   │   ├── drawable/{ic_igseek_launcher.xml,widget_bg.xml}
        │   │   ├── layout/widget_igseek_quick.xml
        │   │   ├── values/{strings.xml,themes.xml}
        │   │   └── xml/igseek_widget_info.xml
        │   └── java/app/igseek/mobile/
        │       ├── IGseekApplication.kt
        │       ├── MainActivity.kt
        │       ├── data/
        │       │   ├── api/{FirebaseAuthApi.kt,IGseekApiClient.kt}
        │       │   ├── local/LocalStore.kt
        │       │   ├── models/Models.kt
        │       │   └── network/NetworkMonitor.kt
        │       ├── ui/
        │       │   ├── IGseekAppRoot.kt
        │       │   ├── state/IGseekViewModel.kt
        │       │   ├── theme/IGseekTheme.kt
        │       │   └── screens/{AuthScreen.kt,ChatScreen.kt,FlowScreen.kt,LibraryScreen.kt,MemoryScreen.kt,SettingsScreen.kt}
        │       └── widget/IGseekQuickWidget.kt
        └── test/java/app/igseek/mobile/ModelsUnitTest.kt
```

## Сборка APK

```bash
gradle -p android-app testDebugUnitTest assembleDebug --no-daemon
```
Готовый APK размещается в `android-app/builds/IGseek-v2.0-native-debug.apk`.
