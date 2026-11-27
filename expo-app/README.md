# IGseek для iOS и Android (Expo Go)

Готовая мобильная версия IGseek с интерфейсом из Web-версии, работающая из коробки в приложении **Expo Go** на iPhone и Android.

## Что уже подключено из коробки
- **Чат с потоковым ответом** (`IGseek Instinct`, `IGseek Chat`, `IGseek Flash` + 6 агентов, режим рассуждений, веб-поиск, вложения).
- **Генерация изображений Pollinations** (на всех тарифах через кнопку фото или `/img`).
- **Все разделы**: Чат, Flow, Библиотека, Избранное, Engine (с живым WebView-превью), Wave, Документы, Память, Настройки.
- **Единый аккаунт и облачная синхронизация**: Google + Почта/Пароль + Firestore (общая база с Web и Android APK).
- **Ключи подписки IGseek Pro** (`IGSK-XXXX-XXXX-XXXX`): активация и мгновенная синхронизация на всех платформах.

## Запуск без ПК (прямая ссылка для Expo Go)
1. Установите **Expo Go** из App Store (или Google Play).
2. Откройте ссылку с телефона и нажмите **Open in Expo Go**:
   `https://snack.expo.dev/FBMVtm_JQSy57x_KIoKpa`

## Локальный запуск с ПК
```bash
cd expo-app
npm install
npx expo start --tunnel
```
