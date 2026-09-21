# Dheemafy Android Music Player 🎵

**Dheemafy** is a native Android music player application engineered for private, high-fidelity music streaming from your existing Dheemafy backend and cloud storage.

---

## Key Highlights

- **100% Native Playback Engine**: Powered by **AndroidX Media3 ExoPlayer** running inside an Android **Foreground `MediaSessionService`**. No WebViews, no HTMLAudioElement, no JavaScript timers.
- **Continuous Seamless Playback**: Songs queue naturally inside ExoPlayer's `MediaItem` pipeline. The player will continuously play song after song without ever randomly pausing or needing manual play clicks.
- **Background & Lock Screen Playback**: Music continues playing uninterrupted when the phone is locked, when switching to other apps, or when the screen is turned off. System media notification and lock screen controls are integrated with album artwork, title, artist, and playback buttons.
- **Strict Playlist Isolation**: Selecting a playlist ("Sharu", "Hills", "All Songs") loads an isolated queue. Playback loops within that playlist and never bleeds into other lists unless explicitly selected.
- **Audio Focus & Headset Integration**: Automatically ducks or pauses audio on phone calls or alarms, and pauses audio when Bluetooth or wired headphones are disconnected.
- **Spotify Dark Aesthetic**: Crafted with Jetpack Compose featuring Spotify's dark theme palette (`#121212` background, `#1DB954` Spotify green accents, rich typography, and responsive layouts).
- **Now Playing Screen**: Displays large album artwork (no lyrics), scrubber seek bar with elapsed/duration time, shuffle toggle, previous with 3-second restart rule, play/pause circle, and repeat mode toggle (Off / All / One).

---

## Project Structure

```
android/
├── app/
│   ├── build.gradle.kts           # App module build config (Media3, Compose, Retrofit, Coil)
│   ├── proguard-rules.pro         # Proguard preservation rules
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml # Permissions (INTERNET, FOREGROUND_SERVICE_MEDIA_PLAYBACK)
│           ├── java/com/dheemafy/music/
│           │   ├── DheemafyApplication.kt # Application class initializing singletons
│           │   ├── MainActivity.kt        # Compose activity & auth switcher
│           │   ├── data/
│           │   │   ├── api/               # Retrofit service & OkHttpClient
│           │   │   ├── local/             # Encrypted session & URL storage
│           │   │   ├── model/             # Song, Playlist, Artist, HomeData models
│           │   │   └── repository/        # MusicRepository (Flows/Coroutines)
│           │   ├── playback/
│           │   │   ├── DheemafyPlaybackService.kt # Foreground MediaSessionService
│           │   │   ├── MediaItemConverter.kt      # Song <-> Media3 MediaItem
│           │   │   ├── PlaybackManager.kt         # MediaController bridge & state
│           │   │   └── PlaybackState.kt           # Reactive UI state model
│           │   └── ui/
│           │       ├── DheemafyApp.kt             # Navigation & Scaffold with MiniPlayer
│           │       ├── components/                # MiniPlayer, SongRow, PlaylistItemCard, ArtistItemCard
│           │       ├── screens/                   # LoginScreen, HomeScreen, PlaylistDetailScreen, etc.
│           │       └── theme/                     # Spotify Dark Color tokens, Typography, Theme
│           └── res/
│               ├── drawable/                      # Launcher vector icons
│               └── values/                        # colors.xml, strings.xml, themes.xml
├── gradle/
│   ├── libs.versions.toml         # Version catalog (AGP 8.5.1, Media3 1.4.0, Compose BOM)
│   └── wrapper/                   # Gradle 8.7 wrapper configuration & jar
├── build.gradle.kts               # Root Gradle project config
├── settings.gradle.kts            # Plugin & repository management
├── gradlew                        # POSIX shell script for Linux/macOS
└── gradlew.bat                    # Batch script for Windows
```

---

## How to Build the APK

### Option 1: Automatic Cloud Build via GitHub Actions (Recommended)
Every push to `main` automatically triggers `.github/workflows/build-apk.yml`, which:
1. Compiles the Android project using JDK 17 and Android SDK 34.
2. Generates `Dheemafy.apk` (debug signed, ready to install directly on devices).
3. Publishes the artifact under **Actions** → **Build Dheemafy Android APK** → **Artifacts** (`Dheemafy-APK`).

### Option 2: Local Command Line Build
With Java 17 and Android SDK installed:

#### On Windows:
```cmd
cd android
.\gradlew.bat assembleDebug
```
Output APK location:
`android\app\build\outputs\apk\debug\app-debug.apk`

#### On Linux / macOS:
```bash
cd android
chmod +x gradlew
./gradlew assembleDebug
```
Output APK location:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## How to Install on Android Devices

1. Transfer `Dheemafy.apk` to your Android phone (via USB, Google Drive, WhatsApp, or downloading directly from GitHub).
2. Tap `Dheemafy.apk` to install.
3. If prompted: **"Install from unknown sources"** or **"Install unknown apps"**, toggle **Allow**.
4. Open **Dheemafy**.
5. Log in with your credentials:
   - **Username**: `sharu` or `you`
   - **Password**: `sharu@123` or `you@123`
6. (Optional) If your server is hosted at a custom domain or private IP, tap **"Configure Server URL"** on the login screen to point directly to your backend.

---

## Backend & Credentials

- Default Server URL: `http://10.0.2.2:4534/` (for Android Emulator) or your remote production URL.
- Supported accounts:
  - `sharu` / `sharu@123`
  - `you` / `you@123`
- Audio streams are delivered via Cloudinary direct HTTPS streams with byte-range (`Accept-Ranges: bytes`) support for fast seeking and buffering.
