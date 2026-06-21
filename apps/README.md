# apps — Host Shells (Presentation Layer)

Thin, per-platform shells behind the Platform Port. They **render** the StimulusFrames the
engine describes and **capture** timestamped input + device signals. They contain no
measurement logic and decide no stimulus content.

| Folder | Target |
|---|---|
| `web/` | Browser (desktop + mobile web). |
| `mobile/` | iOS / Android. |
| `desktop/` | Desktop application. |

Every shell must pass the host conformance test (timing accuracy, luminance, geometry) so
results are comparable across platforms (ARCHITECTURE §14 R7). See §1, §10.1.
