# hnch — pointing poker CLI

Terminal client for hnch (pointing poker for agile teams). Speaks the same Yjs-over-WebSocket protocol as the mobile/PWA client.

## Install

    npm i -g @xauyxau/hnch
    # or one-shot
    npx @xauyxau/hnch create

## Quick start

    hnch create               # create a room, drop into the session as host
    hnch join ABC123          # join an existing room by 6-char code
    hnch resume               # rejoin your last session
    hnch config               # configure default scale / display name / relay URL

## Default relay

`wss://hnch.dev`. Override with the `HNCH_RELAY_URL` env var or `hnch config --relay-url <url>`.

## License

Proprietary. See [LICENSE.md](https://github.com/IIxauII/hnch/blob/main/LICENSE.md).
