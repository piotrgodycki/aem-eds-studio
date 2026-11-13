# Use the studio from your phone or another computer

The studio runs on your computer: the agents, your projects, the tokens. A phone, tablet or second computer can connect to it once it is **paired**. It can then follow and write in the chat, start or change a draft, and review it. What only the computer may do stays there:

- settings and sign-ins (GitHub, Figma, agents);
- adding, removing or exporting projects;
- accepting a draft into the repository, or discarding it;
- managing devices.

Network access is **off** until you turn it on.

## On the same Wi-Fi

1. On the computer, open **Settings → Network access** and turn on **Reach the studio from other devices**. The studio starts listening on port 4610.
2. Choose **Pair a device**. A QR code appears; it works **once**, for **5 minutes**.
3. Scan it with the phone's camera, or open the link it shows. Name the device and choose **Pair**.

The phone then opens the studio at the computer's address, for example `http://192.168.1.20:4610`. Add it to the home screen to come back to it.

On plain Wi-Fi the connection is HTTP. Use it only on a network you trust, such as at home. For anywhere else, use Tailscale.

## From anywhere, over HTTPS (Tailscale)

[Tailscale](https://tailscale.com/download) puts your devices on a private network of their own, with addresses and certificates.

1. Install Tailscale on the computer and the phone, and sign in to the same account.
2. In the Tailscale admin console, turn on **HTTPS certificates** (DNS page).
3. In the studio's **Settings → Network access**, choose **Turn on** next to **Tailscale HTTPS**. The studio runs `tailscale serve`, which gives the computer an address like `https://studio-mac.tail1234.ts.net` with a real certificate.
4. **Pair a device** now offers that address first.

The traffic goes through Tailscale's encrypted network between your own devices. The studio doesn't send anything to a server of ours, and it has none.

## Revoking a device

**Settings → Network access** lists paired devices with when each was last seen. **Revoke** shuts one out at once. Turning Network access off closes the port for all of them. They stay paired for when you turn it back on.

## How it is kept safe

- **Pairing:** a code is 128 random bits, works once and expires after 5 minutes. It stays in the link's `#` part, so it never reaches a server log.
- **Device key:** a paired device gets its own key in a cookie that other websites can't send or read (HttpOnly, SameSite=Strict). The computer keeps only a hash of it.
- **What a device may do:** the network port answers only paired devices, and only for the actions listed above. Everything else answers "only on the computer".
- **Tokens:** they never leave the computer.

Details for developers: [architecture.md](architecture.md#what-the-studio-can-reach).
