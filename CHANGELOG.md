# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-07-04

Full redesign of the public API and internal architecture. See [docs/migrating-from-v2.md](docs/migrating-from-v2.md) for a detailed migration guide, and [docs/architecture.md](docs/architecture.md) for the new maintainer-facing architecture overview.

### Added

- ESM-only package with an `exports` map (no more CommonJS build).
- Migration helper (`npm run migrate:v2-to-v3`, also published as the `web-ant-plus-migrate-v2-to-v3` CLI) that rewrites common v2 API usage to v3.
- `docs/migrating-from-v2.md` migration guide and `docs/architecture.md` architecture documentation for maintainers.
- Typed `Error` subclasses: `AntPlusError`, `ChannelStateError`, `DeviceNotFoundError`, `ProtocolError`.

### Changed

- **Breaking:** `GarminStick2` / `GarminStick3` classes replaced by `USBDriver` static factories that filter for both stick models.
- **Breaking:** `stick.open()` now resolves once the stick has completed its startup handshake, instead of blocking until the stick is closed.
- **Breaking:** `sensor.attachSensor(channel, deviceID)` replaced by `sensor.attach({ channel, deviceId })`, which resolves once the channel is open.
- **Breaking:** All profile-specific events (`hbData`, `powerData`, `envData`, etc.) unified into a single typed `data` event.
- **Breaking:** State fields renamed to camelCase and made readonly (e.g. `ComputedHeartRate` → `computedHeartRate`); every `data` event now delivers an immutable state snapshot.
- **Breaking:** `FitnessEquipment` control commands now return `Promise<boolean>` instead of taking callbacks.
- Sensor decoding logic reworked as pure functions (`(state, DataView) => state | undefined`) decoupled from the stateful connection/channel-management classes.
- Sensor modules refactored to use `Constants` instead of magic numbers for measurement intervals, page data, buffer indices, toggle masks, battery status, wheel circumference, device types, and payload offsets.
- TypeScript configuration enhanced for ESM compatibility and improved type definitions.
- Package toolchain and dependencies updated for v3 (including lockfile sync for CI).

### Removed

- `EventEmitter`, `UpdateState`, and the per-profile `*ScanState`/`*Scanner`/`*Sensor`/`*SensorState` class hierarchies (`BicyclePower*`, `Cadence*`, `Environment*`, `FitnessEquipment*`, `HeartRate*`, `MuscleOxygen*`, `SpeedCadence*`, `Speed*`, `StrideSpeedDistance*`), superseded by the new functional sensor modules under `src/sensors/`.
- Unnecessary peer dependencies (missing ones added where required).

### Fixed

- Environment, cadence, speed, and muscle oxygen profile frame lengths in tests.
- Fake USB default max channels naming in tests.

## [2.1.0] - previous release

See git history prior to `v2.1.0` for changes before this changelog was introduced.
