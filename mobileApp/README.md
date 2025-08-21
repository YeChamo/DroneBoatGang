# MobileApp

A brand new React Native project targeting **Android** (via Android Studio).

---

## 📦 Requirements

Make sure you have the following installed:

### Node.js

- **Version:** `>=20.19.4` (React Native 0.81 requires this minimum)
- Recommended: install via [nvm](https://github.com/nvm-sh/nvm).

```bash
nvm install 20.19.4
nvm use 20.19.4
node -v
npm -v
Java (JDK)
Version: 17

bash
Copy
Edit
brew install openjdk@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version


Android Studio
Download: Android Studio
Open SDK Manager:
SDK Platforms → install Android 16

SDK Tools → install:
Android SDK Build-Tools
Android SDK Platform-Tools
Android SDK Tools

Android Emulator
NDK (Side by side)
Open Device Manager → create a virtual device
Android SDK Environment Variables

Add the following to ~/.zshrc or ~/.bashrc (adjust path if needed):
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH"

Reload shell:
source ~/.zshrc
adb --version

npm install

Start Metro bundler
In one terminal:
npm start

Run on Android:
npx react-native run-android

📌 Versions Used
React Native CLI: @react-native-community/cli@latest
React Native: 0.81.x
Node.js: 20.19.4
npm: 10.x
Java (OpenJDK): 17
Android SDK: API 33+ (Android 13 or newer)
```
