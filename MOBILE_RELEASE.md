# CaseMoney — сборка под RuStore и AppGallery

Веб-приложение завёрнуто в Capacitor — нативные оболочки используют один и тот же
React-билд из `frontend/dist`. **Один подписанный APK** заливается и в RuStore,
и в AppGallery — никаких отдельных билдов делать не нужно.

iOS отложен до момента, когда будет Mac. App Store здесь не рассматривается.

---

## 0. Что должно быть готово до сборки

1. **Бэкенд развёрнут на публичном HTTPS-домене.** Сейчас `frontend/.env.production`
   указывает на `https://api.casemoney.ru` — этот домен должен реально отвечать
   и иметь валидный TLS-сертификат. Без бэка приложение запустится, но не сможет
   ни логиниться, ни ходить за данными.
2. **Privacy Policy URL** (нужен и RuStore, и AppGallery, обязательно). Заведи
   страницу `/privacy` на основном сайте — должен быть текст про сбор email,
   хранение JWT, финансовых данных, передачу третьим лицам (никому), удаление
   по запросу.
3. **Иконка 512×512 + 1024×1024 и сплэш 2732×2732** — уже сгенерированы из
   `frontend/assets/icon-source.svg` и `frontend/assets/splash-source.svg`.
   Чтобы перегенерить:
   ```powershell
   cd C:\projects\HomeMOney\casemoney\frontend
   node assets/rasterize.mjs
   npx cap-assets generate --android
   ```

---

## 1. Локальная пересборка после изменений во фронте

```powershell
cd C:\projects\HomeMOney\casemoney\frontend
npm run build              # → frontend/dist
npx cap sync android       # перенос dist в android/app/src/main/assets/public
```

---

## 2. Android — debug APK для проверки на телефоне

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd C:\projects\HomeMOney\casemoney\frontend\android
.\gradlew.bat assembleDebug
```

APK окажется в `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Установить на подключённый по USB телефон (включи «Отладка по USB»
в Developer options):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r `
  app\build\outputs\apk\debug\app-debug.apk
```

---

## 3. Release keystore — один раз навсегда

**Это самый ответственный шаг. Если потеряешь keystore или пароль —
обновления приложения публиковать будет нельзя ни в RuStore, ни в AppGallery,
придётся регистрировать новое приложение с другим packageName.**

### 3.1. Создать keystore

```powershell
cd C:\projects\HomeMOney\casemoney\frontend\android
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" `
  -genkeypair -v `
  -keystore release.keystore `
  -alias casemoney `
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` спросит:
- пароль для keystore (длинный, сохрани в менеджере паролей),
- пароль для ключа (можно тот же),
- CN, OU, O, L, ST, C — можно вписать своё имя/город/RU.

После генерации:
- `release.keystore` лежит в `frontend/android/` (в git его **нет** — исключён в `.gitignore`).
- **Сделай две резервные копии** на отдельных носителях (зашифрованный USB,
  пароль-менеджер с вложениями, шифрованное облако). Это критично.

### 3.2. Создать `keystore.properties`

В `frontend/android/keystore.properties` (тоже в `.gitignore`):

```properties
storeFile=release.keystore
storePassword=ПАРОЛЬ_ОТ_KEYSTORE
keyAlias=casemoney
keyPassword=ПАРОЛЬ_ОТ_KEY
```

---

## 4. Собрать release APK

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd C:\projects\HomeMOney\casemoney\frontend
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

APK будет здесь:
```
frontend/android/app/build/outputs/apk/release/app-release.apk
```

Проверить подпись:
```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" `
  -printcert -jarfile app\build\outputs\apk\release\app-release.apk
```

Этот APK заливается **и в RuStore, и в AppGallery** — пересобирать не надо.

---

## 5. RuStore — публикация

1. Зарегистрироваться на https://rustore.ru/console
   - Нужен аккаунт VK ID.
   - Тип партнёра: физлицо / ИП / самозанятый / юрлицо.
   - Самозанятый — минимум документов: только ИНН и согласие на самозанятость.
2. Создать приложение:
   - Тип: **Утилиты / Финансы** (категория).
   - PackageName: `ru.casemoney.app` (потом изменить нельзя).
   - Загрузить APK.
3. Заполнить карточку:
   - Название (до 50 симв): **CaseMoney — личные финансы**
   - Краткое описание (до 80): что-то вроде *«Учёт счетов в разных валютах, отчёты и категории»*.
   - Полное описание (до 4000 симв).
   - Иконка 512×512 (есть в `frontend/assets/icon.png` после `rasterize.mjs` —
     отресайзить до 512×512 одной командой, см. ниже).
   - Скриншоты 9:16 минимум 3 штуки (1080×1920 рекомендуется).
   - Возрастной рейтинг: 0+ или 6+.
   - Категория: Финансы.
   - Privacy policy URL.
4. Заполнить «Данные пользователя»:
   - Собираем: email, имя (если задаётся), финансовые транзакции.
   - Цель: предоставление сервиса.
   - Передача третьим лицам: нет.
   - Шифрование в транзите: HTTPS.
5. Отправить на модерацию. Обычно 1-3 рабочих дня.

---

## 6. AppGallery (Huawei) — публикация

1. Зарегистрироваться на https://developer.huawei.com/consumer/en/
   - Тип аккаунта Individual бесплатный, нужны паспорт и банковская карта для верификации.
2. AppGallery Connect → My apps → New → Mobile app.
   - PackageName: `ru.casemoney.app`.
   - Default language: Russian.
   - App category: **Finance / Personal finance**.
3. Загрузить APK во вкладке **Distribute → Release**.
4. Заполнить **App information**:
   - Название RU + EN.
   - Описание RU + EN (до 8000 симв).
   - Иконка 216×216 PNG (отресайз из `assets/icon.png`).
   - Скриншоты JPG/PNG, минимум 3, 1080×1920 или близкое.
   - Privacy policy URL.
   - Возрастной рейтинг — IARC (заполнить опросник).
   - Категория: Finance.
5. **Distribution countries**: выбрать страны, где будет доступно (RU как минимум).
6. Submit. Модерация 1-2 рабочих дня.

**Особенность AppGallery:** проверяют, что приложение **не зависит от GMS**
(Google Mobile Services). Наша оболочка — чистый WebView над HTTPS API,
никаких Firebase / Google Maps / Google Sign-In нет — это пройдёт без вопросов.

---

## 7. Подготовка артефактов карточки (быстрые команды)

После того как `assets/rasterize.mjs` сгенерил `icon.png` 1024×1024:

```powershell
cd C:\projects\HomeMOney\casemoney\frontend\assets
# Иконка 512×512 для RuStore
node -e "require('sharp')('icon.png').resize(512,512).toFile('icon-512.png').then(()=>console.log('ok'))"
# Иконка 216×216 для AppGallery
node -e "require('sharp')('icon.png').resize(216,216).toFile('icon-216.png').then(()=>console.log('ok'))"
```

Скриншоты телефона удобно снять прямо с эмулятора в Android Studio
(AVD Manager → Pixel 6 → Run → Cmd+S для скриншота) или с реального
устройства командой:
```powershell
adb exec-out screencap -p > screen-01.png
```

---

## 8. Версионирование

Перед каждой новой публикацией поднимай в `frontend/android/app/build.gradle`:

```gradle
versionCode 2          // только увеличивать, целое число
versionName "1.0.1"    // человекочитаемое, любое
```

`versionCode` назад уменьшать нельзя.

---

## 9. Что НЕ делать

- Не коммитить `release.keystore`, `keystore.properties`.
- Не публиковать APK мимо стора с тем же `versionCode` — пользователь не сможет
  обновиться, потому что подпись или версия не сойдутся.
- Не менять `applicationId` после первой публикации — это будет другое приложение.
- Не использовать тот же keystore от другого проекта — лучше иметь отдельный.
