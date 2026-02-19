# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-02-19

- feat(logs): add terminal emulation view with xterm.js (46eab7e)

### 🐛 Bug Fixes
- fix(ui): prevent hierarchical tab overflow on small screens (9ec7304)

### 🔧 Maintenance
- chore(release): update CHANGELOG for v0.3.1 (0999315)

**Full Changelog**: https://github.com/jonlar/console-proxy/compare/v0.3.1...v0.4.0
## [0.3.1] - 2026-02-10

- fix(websocket): add ping/pong keepalive to prevent 60s timeout (b4043d6)

### 🔧 Maintenance
- chore(release): update CHANGELOG for v0.3.0 (eb024a4)

**Full Changelog**: https://github.com/jonlar/console-proxy/compare/v0.3.0...v0.3.1
## [0.3.0] - 2026-01-26

- feat(logs): strip ANSI escape codes and control characters from display (7be6223)
- feat(logs): enhance scrollbar visibility in log viewer (18d0ac2)
- feat(logs): add WebSocket support for real-time log updates (7567a20)
- feat(logs): implement pagination for efficient loading of large log datasets (1c69c22)

### 🐛 Bug Fixes
- fix(logs): force scrollbar to always be visible (24a77ea)
- fix(logs): prevent date reset when toggling sort order (4e79ddd)
- fix(logs): add WebSocket proxy and cleanup debug logging (35b60db)
- fix(logs): correct sort direction indicator arrows (5952883)
- fix(logs): improve visibility of date range quick select buttons in light mode (770fd57)

### 🔧 Maintenance
- chore(release): update CHANGELOG for v0.2.3 (c402aca)

### 📝 Documentation
- docs: clean up CHANGELOG.md Unreleased section and add v0.2.3 entry (bcd89bf)

**Full Changelog**: https://github.com/jonlar/console-proxy/compare/v0.2.3...v0.3.0
## [0.2.3] - 2026-01-24

### 🐛 Bug Fixes
- fix(ci): fix YAML syntax error in release workflow (f2ff731)

## [0.2.3] - 2026-01-24

- fix(ci): fix YAML syntax error in release workflow (f2ff731)
- fix(ci): fix CHANGELOG.md generation with proper variable expansion (9ed9d38)

### 🔧 Maintenance
- chore(release): update CHANGELOG for v0.2.2 (1a9bd40)

**Full Changelog**: https://github.com/jonlar/console-proxy/compare/v0.2.2...v0.2.3
## [0.2.2] - 2026-01-24

### 🐛 Bug Fixes
- fix(config): make uuid field optional to allow auto-generation on load (5744da2)

## [0.2.1] - 2026-01-24

### 🐛 Bug Fixes
- fix(docker): move bun command into entrypoint script (c13bd57)
- fix(docker): install dependencies from root using workspace configuration (c96ebd3)

## [0.2.0] - 2026-01-24

### ✨ Features
- feat(logs): add interactive log viewer with live updates and filtering (c3feeef)

## [0.1.1] - 2026-01-20

### Fixed
- Docker version build args now properly passed in GitHub Actions workflow
- Initial terminal session state is now sent to new WebSocket clients, ensuring clients receive current state immediately upon connection

## [0.1.0] - 2026-01-19

### Added
- Dark mode with theme toggle for improved visual comfort
- Version display and copyright footer in UI
- GitHub link in header next to title for easy repository access
- Username management with display, edit, and removal capabilities
- Table view with filtering for better data organization
- 3-column grid layout for card view (previously 2-column)

### Changed
- Implemented consistent design system with CSS variables for maintainability
- Refactored UI to use table view by default instead of card view
- Delete functionality moved to edit form for streamlined workflow
- Docker Compose now uses published image instead of local build
- Removed obsolete `version` attribute from docker-compose.yml

### Fixed
- TypeScript type errors for Port union type
- Code formatting and linting issues across the codebase
- Delete notifications are now temporary instead of permanent

### Removed
- Local serial port support - project now focuses exclusively on remote telnet connections

## [0.0.1] - 2026-01-18

### Added
- Initial console proxy system implementation
- User authentication and session management
- Telnet connection handling
- WebSocket communication for real-time terminal sessions
- Basic port configuration management
- REST API with type-safe contracts using ts-rest
- Frontend built with React and xterm.js for terminal emulation
- Docker support with multi-stage builds
- GitHub Actions CI/CD pipeline

### Documentation
- Created AGENTS.md with project context and conventions
- Added .gitignore file for proper repository hygiene
