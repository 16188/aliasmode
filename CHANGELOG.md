# Changelog

## Unreleased

- Secure the Local API with a per-launch 256-bit bearer token plus strict loopback Host and same-origin validation.
- Encrypt profile credentials, proxy authentication, cookies, and session state with AES-256-GCM using a master key held by Windows Credential Manager.
- Make the Community Edition local-only: migrate legacy mode selections to Local, keep Cloud clients, sync, and remote MCP unavailable at runtime, and close legacy Cloud HTTP routes.
- Replace the proprietary CloakBrowser payload with the open Playwright Chromium runtime pinned by executable SHA-256.
- Add a Token-, Host-, and Origin-protected Local API gateway for native Firefox automation tools.
- Rebrand Windows executables, installers, application data, update assets, and CI artifacts as IDFRI.
- Require Authenticode signing for release installers before creating the signed Tauri updater manifest.
- Replace the upstream updater trust key with a dedicated IDFRI keypair kept outside version control.
- Make release workflow contract tests portable across LF and CRLF checkouts.
- Disable the obsolete installed Cloud acceptance job for the local-only edition.
- Add Chinese local-edition UI copy, IDFRI window branding, project links, and shutdown dialogs while retaining the AliasMode Firefox engine name.
- Remove the upstream proxy promotion and all of its UI slots, remove Cloud/community links, tighten the desktop external-link allowlist, localize updater-facing messages, and align identity-card tests with the new labels.
- Align source-start tests with the IDFRI Chromium environment variables and the local-only configuration migration; retire the obsolete Cloud cross-device acceptance test.
- Localize shared dashboard labels, fingerprint controls, updater progress, and proxy-check feedback; remove the unreachable Cloud mode-switch confirmation UI and its dead state.
- Localize the reachable profile roster, bulk actions, update banner, pagination, and extension-management screens.
- Localize logs, cookies, profile create/edit, import, and file-update dialogs; rename downloaded examples from AliasMode to IDFRI.
- Replace obsolete upstream dashboard assertions with IDFRI local-edition UI contracts and publish Chinese build, security, and contribution guidance.
- Stop redistributing AliasMode Firefox's bundled proprietary operating-system fonts; packaged and source-installed runtimes now use fonts already installed on the host.
- Point agent bootstrap, upgrade acceptance, installer paths, registry checks, and release URLs at the IDFRI product and `16188/aliasmode` repository.
- Finish the visible Chinese labels for update checks, proxy checks, and the Chromium profile option.
- Repair update-attempt recovery to validate the IDFRI registry keys and `IDFRI.exe` instead of obsolete AliasMode installation records.
- Remove the two Cloud-only MCP tools from the local edition's advertised and callable tool surface, and rename MCP product descriptions to IDFRI.
- Correct the Local API contract to document required Bearer authentication and the IDFRI Chromium runtime.
- Finish active release, Agent bootstrap, CI, and desktop-service branding; restrict bootstrap downloads to the IDFRI fork.
- Repair Windows acceptance paths for packaged Chromium and IDFRI updater state; skip previous-version acceptance only when no earlier IDFRI release exists.
- Localize durable updater results and remaining reachable desktop errors; rename logs and exports to IDFRI.
- Prevent profile-encryption keys and other `IDFRI_*` secrets from reaching user Playwright scripts.
- Align release and managed-browser contract tests with the IDFRI artifact and Chromium names.
