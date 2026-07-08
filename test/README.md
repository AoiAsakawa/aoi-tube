# Tests

## Load Tests

1. Install [artillery](https://artillery.io/) from your JavaScript package manager of choice.
1. Start an instance of the server on localhost.
1. `cd test/load`
1. `artillery run hls.yaml` for HLS endpoint load tests (targets `http://localhost:8080`).
1. `node chatLoadTest.js` for websocket chat load tests (`badchatdata.js` feeds it malformed payloads).

## Chat test

This will send automated fake chat messages to your localhost instance.
Edit the messages, usernames or point to a different instance.

1. `npm install`
1. `node fakeChat.js`

## Automated tests

`test/automated/` contains the upstream API, HLS and browser test suites
(`api/`, `hls/`, `browser/`, `upgrades/`). Each subdirectory has its own
run script; they expect a locally built binary.

## Public Testing

Run `./test-local.sh` and it'll create a public URL that you can access your local AoiTube instance from. This is particularly useful for testing mobile and other external devices, as well as webhooks. Make sure AoiTube is running under port 8080.

If you'd like your own custom hostname that uses your username follow the instructions printed, otherwise use the auto-generated name printed to the console for testing.

```
$ ./test/test-local.sh
Please wait. Making the local server port 8080 available at https://oc-gabek-develop.serveo.net
Forwarding HTTP traffic from https://oc-gabek-develop.serveo.net
```
