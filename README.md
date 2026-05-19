# jekyll-index-of

A Jekyll + GitHub Pages template that renders an elegant, searchable “Index of …” file browser for content stored under `public/`.

## Template readiness review

### What is already template-friendly
- Generic repository structure (`_layouts`, `_includes`, `assets/icons`, `public/`).
- No secrets or environment-specific credentials in tracked files.
- Automated build pipeline for GitHub Pages (`.github/workflows/pages.yml`).
- MIT license is present.

### Missing / potentially problematic for template use
- **Hardcoded content root**: `/public/` is hardcoded in `index.html`, `_layouts/directory.html`, and `generate-directory-listings.js`.
- **Base URL assumptions**: absolute links (for example `/assets/...`) may require care on project Pages sites.
- **Generated files can be accidentally committed** without explicit ignore rules (`_data/directory.json`, generated `public/**/index.html`).
- **Minimal setup docs** (before this update) made onboarding/customization unclear.

### Recommended improvements
- Add configurable content root and base-url-safe link handling.
- Keep generated listing artifacts out of commits.
- Document setup/customization paths clearly for template users.
- Optionally add `_config.yml` defaults to centralize site-level settings.

## Use this repository as a template

1. Click **Use this template** on GitHub.
2. Create a new repository from this template.
3. In your new repo, add files/folders under `public/`.
4. Enable **GitHub Pages** (Settings → Pages) and select **GitHub Actions** as the source.
5. Push to `main` to trigger deployment.

## How it works

- `generate-directory-listings.js` scans `public/` recursively.
- It writes directory metadata to `_data/directory.json`.
- It creates `index.html` files in each directory using front matter and the `directory` layout.
- Jekyll renders the directory pages with search, sorting, icons, and parent navigation.

## Local setup and usage

### Prerequisites
- Node.js 20+ (used for listing generation)
- Ruby + Jekyll toolchain (for local Jekyll serving)

### Build listing data

```bash
node generate-directory-listings.js
```

### Run locally with Jekyll

If your environment already has Jekyll installed:

```bash
jekyll serve
```

Then open `http://localhost:4000`.

## Customization guide

- **File-type icons**: edit `_includes/icon_mapper.html`.
- **UI/layout**: edit `_layouts/directory.html` styles and markup.
- **Redirect behavior**: edit root `index.html`.
- **Content**: place files and folders under `public/`.

For deeper template hardening, consider parameterizing the `/public/` path and absolute asset links.

## Additional template-appropriate changes to keep

- Keep `.gitignore` entries for generated listing artifacts.
- Keep `LICENSE` in derived repositories.
- Consider adding docs for your own conventions if you further customize behavior.

## License

MIT — see [LICENSE](LICENSE).

## Author

Original repository author: Luka Mamukashvili.
