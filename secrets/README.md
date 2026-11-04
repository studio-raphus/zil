# secrets/ (git-ignored, except this file)

Files here are mounted read-only into services at `/run/zil-secrets/`.

- `firebase-service-account.json`: Firebase console → Project settings → Service accounts →
  *Generate new private key*. Lets the live service send push notifications (FCM).
  Without it, Studio shows push as "not set up" and everything else works.
