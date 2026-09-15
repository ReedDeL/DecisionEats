# How to Test DecisionEats on Your iPhone (Web)

> [!NOTE]
> This opens the **web version** of DecisionEats in Safari on your iPhone. It does not install an iOS app — that requires a Mac and an Apple Developer account.

---

## Part 1 — One-time Setup

You only ever need to do this once.

### 1. Restart WSL

Close your terminals, then open **PowerShell** on Windows and run:

```powershell
wsl --shutdown
```

Wait about 10 seconds, then reopen your terminal.

### 2. Open the port in the Windows Firewall

Open **PowerShell as Administrator** (right-click Start → *Terminal (Admin)*) and paste both commands:

```powershell
New-NetFirewallRule -DisplayName "Expo dev server" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
```

---

## Part 2 — Every Time You Want to Test

1. Put your iPhone and your PC on the **same Wi-Fi network**.
2. On your PC (inside `/home/rjdel/Projects/DecisionEats`), start the web app:

   ```bash
   npm run web
   ```

3. On your iPhone, open **Safari** and navigate to:

   ```text
   http://<YOUR_PC_IP>:8081
   ```

   *(e.g., `http://10.0.0.224:8081`)*

The app loads like a standard website. Keep the terminal running while testing.

> [!TIP]
> **Add to Home Screen**: In Safari, tap the **Share** menu → **Add to Home Screen**. It will launch full-screen without browser bars, providing a native app-like experience.

---

## If the Address Stops Working

Your PC's Wi-Fi IP address can change when reconnecting or switching networks. To find your current IP:

1. Open **PowerShell** on Windows:
   ```powershell
   ipconfig
   ```
2. Look under **Wireless LAN adapter Wi-Fi** for **IPv4 Address**.
3. Use that address in place of `10.0.0.224`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Safari cannot connect** | Verify both devices are connected to the exact same Wi-Fi network (avoid guest networks or mobile hotspots that block client-to-client traffic). |
| **Still cannot connect** | Confirm both PowerShell commands from Part 1, Step 2 were executed in an **Administrator** window. |
| **Worked previously, failing now** | Your PC's local IP address likely changed. Re-run `ipconfig` and update the URL. |
| **Page loads stale content** | Pull down to refresh in Safari. Web bundles may not always hot-reload automatically on mobile browsers. |

---

## Backup Option: Tunnel Mode (No Setup, Works Anywhere)

If the local Wi-Fi routing is restricted or you are on different networks, use Expo's tunnel mode:

```bash
npx expo start --web --tunnel
```

- Accept the prompt to install `@expo/ngrok` if asked.
- It will print a public `https://...` URL that you can open on your iPhone from any network.

> [!WARNING]
> The tunnel URL is publicly accessible and has higher latency. Use it for quick validation rather than daily development.
