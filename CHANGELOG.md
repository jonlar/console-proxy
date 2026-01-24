# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- UUID support for unique port identification - each port now has a stable UUID for tracking and logging
- Traffic logging with configurable log directory and size
  - Logs stored per port UUID in daily JSON files
  - Line-by-line logging with proper line break detection
  - Configurable via `--max-log-size` / `-m` argument (default: 1MB)
  - Automatic buffer flushing on connection disconnect
- Command-line arguments for server configuration
  - `--port` / `-p`: Port to listen on (default: 3001 or PORT env var)
  - `--data-dir` / `-d`: Directory for config and logs (default: "../../" or DATA_DIR env var)
  - `--max-log-size` / `-m`: Maximum log size in MB per port (default: 1)

### Changed
- Upgraded Docker base image from node:20-alpine to node:24-alpine for security updates
- Terminal now automatically receives focus when opened, allowing immediate input

### Fixed
- WebSocket type compatibility by importing WebSocket type from 'ws' library instead of DOM type
- UUID preservation when updating ports - UUIDs now remain stable across configuration changes

### Removed
- Dropped local port schema support (planned feature that was never implemented)

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
