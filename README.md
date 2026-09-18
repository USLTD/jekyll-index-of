# jekyll-index-of

An elegant, searchable directory listing template for Jekyll and GitHub Pages.

It turns a content folder (default: `public/`) into an “Index of …” browsing experience with:
- file/folder listings
- breadcrumb navigation
- parent-directory navigation
- file-type icons
- in-page search and sorting

## Use this as a GitHub template

1. Click **Use this template**.
2. Create your new repository.
3. Add your files under the content root (default: `public/`).
4. Enable **GitHub Pages** in your new repository and choose **GitHub Actions** as the source.
5. Push to `main`.

The included workflow builds and deploys automatically.

## How it works

1. `node generate-directory-listings.js` scans your content root recursively.
2. It generates:
   - `_data/directory.json` (directory metadata)
   - `index.html` files inside each content directory
3. Jekyll renders pages using `_layouts/directory.html`.

## Setup

### Prerequisites
- Node.js 20+
- Jekyll toolchain for local preview (Ruby + Jekyll)

### Generate listing pages/data

```bash
node generate-directory-listings.js
```

### Local preview

```bash
jekyll serve
```

Then open `http://localhost:4000`.

## Configuration

### `content_root`

Default content root is `public`.

You can change it in `_config.yml`:

```yml
content_root: public
```

Or override for generation with an environment variable:

```bash
CONTENT_ROOT=downloads node generate-directory-listings.js
```

When changing `content_root`, move your files/folders to that directory.

### Symlinks

Symlink handling is intentionally conservative so that builds stay reproducible and safe:

- **File symlinks** inside the content root are listed (marked as symlinks) and served like normal files.
- **Directory symlinks** are listed, but never traversed — they link straight to their target's canonical listing page.
- **Symlinks pointing outside the content root** are skipped entirely (GitHub Pages would never publish their targets anyway).
- **Broken symlinks** and **circular directory symlinks** are reported as build breakers — remove or repair them, otherwise the Jekyll build fails with a filesystem error.

### Custom `index.html` pages

You can drop your own `index.html` into any content directory. The generator preserves user-authored pages and never overwrites them; generated pages are refreshed on every run. If your page uses `layout: directory`, its body content is rendered below the file table.

## Customization

- Layout and styles: `_layouts/directory.html`
- File extension → icon mapping: `_includes/icon_mapper.html`
- Root redirect page: `index.html`
- Icons: `assets/icons/` — all referenced icons (FatCow pack, CC BY 3.0) are committed to the repository, so a fresh clone builds and previews correctly without waiting for CI. The *Fetch missing FatCow icons* workflow keeps the set in sync automatically whenever the layout, mapper, or 404 page change.

## License

MIT — see [LICENSE](LICENSE).

## Author

Original repository author: Luka Mamukashvili.
