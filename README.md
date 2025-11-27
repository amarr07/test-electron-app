# NeoSapien Desktop App

## Setup

Install dependencies:

```bash
npm install
```

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Configure environment variables in `.env` file.

## Development

Start development server (works on Windows/macOS):

```bash
npm start
```

### Build for production

#### Windows installer

```bash
npm run build:win
```

#### macOS build

```bash
npm run build:mac
```

Format code:

```bash
npm run format
```
