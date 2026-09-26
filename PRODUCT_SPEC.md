# Standalone Voice Recorder — Product Specification

## Summary

Build a discreet, pocketable recorder for thinking professionals capturing solo ideas,
walking notes, interviews, and 30–90-minute brainstorming sessions. The recorder prioritizes
never missing audio, immediate physical clarity, long battery life, and seamless ingestion
into Thoughts.

The launch product records archival-quality WAV masters plus compact transcription proxies.
Proxies transfer automatically over BLE. Full WAV masters sync automatically to a paired Mac
over trusted Wi-Fi, with authenticated USB-C as the fast and reliable fallback.

## Product and Hardware

- Approximately 80 mm tall and 34 mm in diameter.
- Target weight: 55–75 g.
- Target scaled retail price: $199–249.
- Cylindrical anodized-aluminum enclosure with polymer RF and acoustic windows.
- Minimal external branding, IP54 ingress protection, and 1 m drop resistance.
- Two isolated, top-facing digital MEMS microphones.
- One centered RGB status LED and one unlit physical button near the bottom.
- 64 GB fixed, encrypted internal storage.
- USB-C for charging, authenticated data transfer, and firmware updates.
- Minimum 12 hours continuous recording; target 18 hours.
- Minimum seven days connected standby.
- Recording while charging is supported.
- Recording always preempts and safely pauses file transfer.
- No routine power switch; the button controls wake and display-dark sleep.
- No speaker, headphone output, playback, volume control, file browser, or screen.
- No 3.5 mm analog input. Future USB digital-microphone support is outside v1.

## Recording and Audio

- Optimized for handheld voice capture at 20–80 cm.
- Designed for quiet rooms, walking, cafés, vehicles, light wind, and moderate handling noise.
- Archival master: stereo PCM WAV, 24-bit/48 kHz.
- Master processing is limited to conservative fixed gain, headroom protection, DC blocking,
  and overflow safety.
- No irreversible noise reduction, compression, or automatic gain control in the master.
- Transcription proxy: processed mono AAC-LC, 24 kHz, approximately 32 kbps.
- Proxy processing may include lightweight beamforming, wind suppression, and voice enhancement.
- Record-start indication appears within 100 ms.
- Valid saved audio begins within 300 ms of record activation.
- No pre-roll. Silence never stops or pauses a recording.
- A paused recording retains its recording UUID and resumes into the same continuous note.
- Long recordings are stored as recoverable segments under one recording UUID and presented as
  one continuous note.
- A 90-minute recording survives forced restart with no more than two seconds of lost audio.
- Approximate master size is 1.04 GB per recorded hour, providing at least 50 hours of usable
  master capacity after system reserves.

## Physical Interface

The launch interface is the selected **Single RGB LED + button** configuration. The LED is a
status indicator, not an audio-level meter. The physical button itself is unlit.

### Button behavior

- Off + tap: wake the device without starting a recording.
- Awake + tap: begin recording.
- Recording + tap: pause without finalizing the recording.
- Paused + tap: resume the same recording.
- Recording or paused + one-second hold: stop and safely finalize.
- Awake and idle + one-second hold: enter display-dark sleep.
- Releasing before the hold threshold cancels the stop or power-off action.
- Idle for 60 seconds enters display-dark sleep automatically.
- Pairing and factory reset are initiated from the companion panel in the prototype. Production
  pairing/reset entry must remain deliberate and must not conflict with capture gestures.

### LED language

| Device state | Single RGB LED behavior |
|---|---|
| Off / display-dark sleep | Off |
| Wake | White fades in |
| Awake and ready | Steady white |
| Recording | Slow pulsing red |
| Paused | Pulsing blue |
| Stop or power-off hold | Yellow fades from dim to bright over one second |
| Recording finalized | Three yellow flashes, then steady white |
| Pairing | Pulsing white |
| Transfer active | Pulsing white |
| Charging while idle | Pulsing green |
| Low battery on wake | Amber warning |
| Recording-blocking failure | Rapid red flashing that cannot resemble recording |

Charging takes priority over pairing and transfer presentation while the recorder is idle.
Recording, pause, hold progress, and blocking errors take priority over background states.
Reduced-motion mode uses static, unambiguous colors rather than animation.

## Companion Ecosystem and Transfers

### BLE

- BLE handles discovery, secure pairing, status, transfer acknowledgements, and automatic
  transcription-proxy transfer.
- Failed proxy transfers remain queued and resume without continuously keeping the radio awake.
- iPhone and Mac are the launch platforms.
- Pairing keys propagate between the user’s Apple devices through iCloud Keychain.
- Manual physical pairing supports companions using different Apple accounts.

### Wi-Fi master transfer

- Include a low-power 2.4 GHz Wi-Fi radio suitable for 802.11n or better throughput.
- Approved Wi-Fi credentials are provisioned securely by the iPhone or Mac companion over BLE.
- There is no on-device network menu, keyboard, captive-portal flow, or permanent access-point mode.
- Support WPA2-Personal and WPA3-Personal networks. Enterprise Wi-Fi and captive portals are
  outside v1.
- Full WAV masters sync automatically to the paired Mac when the recorder is not recording, the
  Mac is available on an approved local network, and the recorder is charging or above 30% battery.
- An iPhone receives proxies by default. Full master download to iPhone is an explicit,
  per-recording action.
- The recorder does not independently upload to iCloud or a vendor server.
- Transfers use mutually authenticated, encrypted sessions bound to the recorder’s device identity.
- Interrupted transfers resume by segment or verified byte range.
- Per-file hashes verify integrity before a master is marked safely imported.
- Target sustained Wi-Fi payload throughput: at least 20 Mbps under normal same-room conditions.
- Target transfer time for a 90-minute master: less than 15 minutes under normal conditions.

### USB-C

- Authenticated USB transfer supports first import, bulk transfer, recovery, and environments
  without compatible Wi-Fi.
- Internal storage is not exposed as an unencrypted mass-storage volume.
- The Mac companion imports and verifies files through an authenticated device protocol.
- Users export decrypted WAV files from Thoughts when needed.
- Signed firmware updates are installed through the Mac USB companion in v1.
- BLE and Wi-Fi firmware updates are outside the launch scope.

### Thoughts ingestion

- Receipt of a proxy automatically creates the recording and starts transcription.
- A later Mac Wi-Fi or USB master import attaches to the existing note using its recording UUID.
- iCloud privately syncs note metadata, transcripts, summaries, and proxies.
- Full master storage in iCloud is optional and disabled by default.
- Masters remain local to the user’s Mac unless cloud-master storage is enabled.

## Data, Security, and Retention

Each recording carries stable recording and device UUIDs, UTC start/end timestamps and originating
timezone, ordered segment IDs and continuity metadata, master and proxy formats, audio-processing
and firmware versions, per-file hashes, and transfer acknowledgements.

- Internal recordings are encrypted after initial pairing.
- Unpaired hosts cannot browse or decrypt storage.
- iCloud Keychain provides pairing-key recovery.
- Loss of every paired device and the associated account requires factory reset, erasing recordings
  and creating a new device identity.
- Storage uses a rolling archive.
- Only the oldest recordings whose proxy and master are both verified as imported may be deleted
  automatically. Unconfirmed recordings are never deleted automatically.
- Low storage remains prominently visible in the companion and blocks new recording with an
  unmistakable LED error when safe capacity is exhausted.

## Acceptance Tests

- At least 95% of first-time users wake and start recording unaided using the two-tap flow.
- Every participant correctly recognizes active recording and paused recording in handheld and
  tabletop positions.
- Waking never starts a recording, and no failed start appears successful.
- A short press during recording pauses; a second short press resumes the same recording.
- Releasing a stop hold before one second continues the recording without finalizing.
- A completed one-second hold finalizes exactly once and shows three yellow flashes before ready.
- An idle one-second hold powers off; the next tap wakes without recording.
- An idle device returns to display-dark sleep after 60 seconds.
- Pairing/transfer pulses white, charging pulses green, and blocking errors cannot resemble recording.
- A 90-minute recording imports as one continuous Thoughts note after forced restart.
- Device delivers at least 12 hours continuous recording, with 18 hours as the engineering target.
- Proxy transfers resume and deduplicate after interruption.
- A proxy received by iPhone and a master later received by Mac merge into one note.
- A 90-minute master transfers over normal local Wi-Fi in under 15 minutes.
- Wi-Fi interruption, Mac sleep, or network loss never corrupts or prematurely acknowledges a master.
- Recording begins immediately when requested during transfer, safely pausing that transfer.
- USB can recover every intact recording when Wi-Fi is unavailable.
- Unpaired access cannot reveal recorded audio.
- Device passes IP54 and 1 m drop validation.
- Microphone validation covers quiet speech, walking, café noise, vehicle noise, light wind,
  handling noise, and distances from 20–80 cm.
- The processed proxy matches or improves transcription accuracy compared with a basic mono
  downmix of the raw master.

## Product Decisions

- The single RGB LED + button concept is the sole production interface; OLED and five-light
  concepts remain research history rather than product SKUs.
- The aluminum cylinder, centered LED, bottom button, gesture timing, and LED language are the
  selected industrial-design direction.
- Wi-Fi plus USB replaces the earlier USB-only master-transfer decision.
- Automatic Wi-Fi master delivery is Mac-first, with network credentials provisioned over BLE.
- USB remains mandatory for recovery and firmware service.
- No account system or vendor-operated cloud is introduced.
