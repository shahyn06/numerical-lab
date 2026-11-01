# Numerical Lab for Android

An offline Android edition of Numerical Lab by saeed shahyn, for Android 8.0 or newer.
The APK bundles the same root solvers, interpolation engine, Arabic/English interface,
light/dark palettes, equation builder, and draggable charts as the website.

The build copies `../docs` into generated APK assets. The numerical engine is unchanged.
Only CSV download calls receive a small Android adapter: Android's document picker lets
the user choose where to save each CSV. No broad storage or network permission is used.
External links open in the phone's browser. Themes and language remain on the device.

## Build

Use JDK 17, Gradle 8.13, and Android SDK platform 36:

```sh
gradle -p android --no-daemon :app:assembleDebug :app:lintDebug
```

The **Android app** GitHub Actions workflow builds and checks the app with these pinned
tools and publishes an APK artifact. The initial APK is a debug-signed preview for
personal testing; it is not a Play Store release. Keep a private release signing key
before distributing production updates. APKs built with a different signing key cannot
replace an existing installation in place.

Numerical validation is also run with `node --test tests/*.test.mjs` before packaging.
