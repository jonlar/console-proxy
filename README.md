# Console Proxy

A proxy system for handling console communication and interactions, enabling transparent console communication bridging.

## Features

- Console port communication handling
- Proxy functionality for console interactions
- Transparent console communication bridging

## Technology Stack

- **TypeScript** - Primary programming language
- **Bun** - Runtime and package manager
- **Biome** - Code linting and formatting
- **React** - Frontend framework
- **Express** - Backend web framework
- **ts-rest** - Type-safe REST API contracts

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your system

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd console-proxy

# Install dependencies
bun install
```

### Development

```bash
# Run development server
bun run dev

# Run linting
bun run lint

# Run formatting
bun run format
```

### Docker Deployment

Build and run using Docker:

```bash
# Build the Docker image
docker build -t console-proxy .

# Run the container with a named volume
docker run -d -p 80:80 -v console-proxy-data:/data console-proxy

# Or use docker-compose
docker-compose up -d
```

The application will be available at http://localhost

**Configuration:**
- Frontend: Port 80 (HTTP)
- Backend API: Port 80 (same server)
- WebSocket: Port 80 at `/ws` endpoint
- Configuration file: `/data/config.json` (persisted in Docker volume)
- On first run, an empty `config.json` with `{"ports":[]}` is created

**Volume Management:**
```bash
# View the config file
docker exec console-proxy cat /data/config.json

# Edit the config (then reload via API or restart)
docker cp console-proxy:/data/config.json ./config.json
# ... edit config.json ...
docker cp ./config.json console-proxy:/data/config.json
docker restart console-proxy
```

## Development Guidelines

### Code Quality

- All code must be linted and formatted using Biome before committing
- Run `bun run lint` and `bun run format` before committing changes

### Commit Convention

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

Format: `<type>(<scope>): <description>`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Example:**
```
feat(proxy): add serial port connection handler
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code follows the project's code quality standards and commit conventions.
