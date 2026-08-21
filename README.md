# pdfslice

PDF page-image splitter, gatherer, and integrity checker.

pdfslice helps you break a PDF into one image per page, keep a manifest of the split output, verify whether all page images are present, and rebuild a PDF from those images when needed.

## About the Project

This project is designed for workflows where PDF pages need to be processed as images without losing the source document structure. It keeps the original PDF intact, writes page-level JPG files into a folder beside the source, and records metadata so the project can later verify or reconstruct the full document.

### Features

- Split PDF files into per-page JPG images
- Keep a manifest with page hashes and metadata
- Check for missing page images without rewriting a PDF
- Gather page images back into a single PDF
- Optionally flatten output folders across a directory tree
- Support dry-run mode for safe previewing

## Getting Started

### Prerequisites

- Node.js
- pnpm

### Install dependencies

```bash
pnpm install
```

### Build the project

```bash
pnpm build
```

## Usage

The CLI exposes three commands:

```bash
pdfslice split <input> [--level <n>] [--flatten] [--dry-run] [--verbose] [--quiet]
pdfslice gather <input> [--dry-run] [--verbose] [--quiet]
pdfslice check <input> [--verbose] [--quiet]
```

### 1) Split a PDF into images

```bash
pdfslice split ./documents
```

This scans the target folder for PDF files and creates a folder for each PDF, for example:

```text
documents/
├── sample.pdf
└── sample/
    ├── sample.001.jpg
    ├── sample.002.jpg
    ├── sample.003.jpg
    ├── sample.pdf
    └── .pdfslice-manifest.json
```

The original PDF is preserved and copied into the generated output folder.

#### Directory search depth

```bash
pdfslice split ./documents --level 2
```

Use `--level` to control how deep the search should go when scanning nested folders.

#### Flatten output

```bash
pdfslice split ./documents --flatten
```

This places each generated output folder at the input root instead of beside each source PDF.

### 2) Gather images back into a PDF

```bash
pdfslice gather ./documents/sample
```

This rebuilds a combined PDF from the page images in the split unit folder and writes a file such as:

```text
sample.gathered.pdf
```

If a PDF already exists and the image hashes have not changed, the project skips unnecessary regeneration.

### 3) Check for missing page images

```bash
pdfslice check ./documents/sample
```

This reports missing pages without creating a PDF output.

## Common flags

- `--dry-run`: preview actions without writing files
- `--verbose`: print debug logging
- `--quiet`: print only errors
- `--log-file <path>`: write logs to JSON as well as console

## Example workflow

```bash
pdfslice split ./input --level 2
pdfslice check ./input/report
pdfslice gather ./input/report
```

## Project Structure

```text
src/
├── app.ts
├── context.ts
├── bin/
│   ├── bash-complete.ts
│   └── cli.ts
├── commands/
│   ├── check/
│   ├── gather/
│   └── split/
├── lib/
│   ├── discover.ts
│   ├── gather.ts
│   ├── hash.ts
│   ├── logger.ts
│   ├── manifest.ts
│   └── split.ts
└── lib/__tests__/
```

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the relevant checks and tests
5. Open a pull request

Please also read the [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) files.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.

See [LICENSE.md](LICENSE.md) for the full text.

## Repository

- GitHub: https://github.com/DuckyMomo20012/pdfslice
- Author: DuckyMomo20012
