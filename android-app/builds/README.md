# IGseek Android APK Builds

Готовые скомпилированные APK-файлы (`IGseek-v2.0-native-debug.apk`) автоматически собираются и публикуются workflow `.github/workflows/build-apk.yml` в GitHub Actions:

1. Откройте вкладку **Actions** в репозитории GitHub → **Build Native IGseek Android APK**.
2. Сборка запускается автоматически при пуше изменений в `android-app/` или вручную кнопкой **Run workflow**.
3. После завершения (~1–2 мин) готовый `IGseek-v2.0-native-debug.apk` доступен:
   - в разделе **Artifacts** запуска GitHub Actions,
   - и автоматически коммитится прямо в эту папку `android-app/builds/IGseek-v2.0-native-debug.apk`.
