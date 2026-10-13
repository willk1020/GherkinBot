# GherkinBot
A multi-tier desktop application built with Java and Electron that integrates Twitch and OBS Studio APIs to automate stream monitoring, handle live telemetry, and trigger localized desktop events.

Backend Logic: Java

Frontend UI: Node.js / Electron

External Integrations: Twitch API, OBS Studio WebSockets


Architecture: Event-driven, asynchronous polling

Multi-Tier Architecture: Combines a robust Java backend for data processing with a lightweight Electron frontend for the interactive dashboard.

Real-Time API Integration: Monitors live stream states by authenticating and parsing telemetry data directly from Twitch and OBS.

Event-Driven Alerts: Routes webhook data to trigger localized desktop audio and visual alerts based on specific channel events.

Modular Dashboard Widgets: Features a dynamic UI with self-contained widgets for monitoring live session data, connection status, and event histories.


## 🧠 Technical Highlight: Scope Management & API Constraints
**The Challenge:** Twitch's EventSub API requires a secure, public-facing HTTPS endpoint for real-time push notifications. Because Gherkinbot was strictly scoped as a locally hosted desktop application to ensure zero latency, it could not pass the external security requirements for webhook delivery.

**The Solution:** Rather than bloating the project with paid cloud relay servers or compromising the local-hosting requirement, I made the architectural decision to cull the follower-alert feature entirely. This allowed me to reallocate development time to the core deliverables, successfully shipping the custom widgets, sound alert pipeline, and OBS WebSocket integrations without stalling the project.
