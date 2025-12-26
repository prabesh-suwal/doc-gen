# DOCX Template Processing Engine

A Node.js-based document templating system that patches structured JSON data into DOCX templates and outputs the final document as DOCX, PDF, or HTML.

## Features

- **Variable substitution** with nested object support
- **Loops** for dynamic tables and lists
- **Conditions** (if/else, inline ternary)
- **Formatters** for dates, numbers, text
- **Aggregations** (sum, count, avg, min, max)
- **Computed fields**
- **Dynamic images**
- **PDF/HTML conversion** via LibreOffice

## Prerequisites

- Node.js >= 18.0.0
- LibreOffice (for PDF/HTML conversion)

### Install LibreOffice

**Ubuntu/Debian:**
```bash
sudo apt install libreoffice
```

**macOS:**
```bash
brew install --cask libreoffice
```

## Installation

```bash
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Template Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/templates` | Upload template |
| GET | `/api/templates/:id` | Get template info |
| DELETE | `/api/templates/:id` | Delete template |
| GET | `/api/templates` | List templates |

### Rendering

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/render/:templateId` | Render from stored template |
| POST | `/api/render` | One-time render |

### Request Body

```json
{
  "data": {
    "name": "John Doe",
    "items": [
      { "product": "Widget", "price": 10.00 }
    ]
  },
  "result": "docx|pdf|html",
  "operation": {
    "pageBreakBefore": ["section2"]
  }
}
```

## Template Syntax

| Feature | Syntax | Example |
|---------|--------|---------|
| Variable | `{d.field}` | `{d.name}` |
| Nested | `{d.user.name}` | `{d.customer.address.city}` |
| Loop | `{#d.items}...{/d.items}` | See below |
| Condition | `{#d.flag}...{/d.flag}` | Show if truthy |
| Inline | `{d.x == 1 ? 'A' : 'B'}` | Ternary |
| Formatter | `{d.date:formatDate('YYYY-MM-DD')}` | Format value |
| Image | `{%d.logo}` | Insert image |

### Loop Example

```
{#d.items}
  Product: {d.product}
  Price: {d.price}
{/d.items}
```

## License

MIT
