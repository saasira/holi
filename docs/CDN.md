# CDN Distribution

Holi release artifacts can be consumed directly from a free CDN by publishing the package to npm and referencing the built files from jsDelivr or unpkg.

## Recommended Flow

1. Create and push a release tag such as `v0.1.5`.
2. Let GitHub Actions publish the package to npm.
3. Reference the versioned `dist` assets from jsDelivr in application pages.

The repository includes a publish workflow at `.github/workflows/publish-npm.yml`. It runs on pushed version tags and publishes the package with provenance enabled.

## Required Repository Setup

- Add an `NPM_TOKEN` repository secret with publish access to the target npm package or scope.
- Ensure the npm package name in `package.json` is available to your account or organization.
- For this repository, the package name is `@saasira/holi`, so the npm token should be allowed to publish within the `@saasira` scope.
- Push semantic version tags in the form `vX.Y.Z`.

## Recommended CDN

Use jsDelivr for primary distribution because it serves individual files from npm packages and supports immutable versioned URLs.

Pattern:

```text
https://cdn.jsdelivr.net/npm/<package-name>@<version>/<file>
```

For Holi `v0.1.5`:

```html
<script src="https://cdn.jsdelivr.net/npm/@saasira/holi@0.21.0/dist/holi.js"></script>
```

The bootstrap then loads `components.html`, `layouts.html`, lazy JS chunks, and per-component CSS from the same `dist/` base as needed.

## Fallback CDN

unpkg can be used with the same package versioning model:

```html
<script src="https://unpkg.com/@saasira/holi@0.21.0/dist/holi.js"></script>
```

## Versioning Guidance

- Pin exact versions such as `0.1.5` for production applications.
- Avoid `latest` for application pages because it makes releases non-repeatable.
- Keep the git tag, `package.json` version, and published npm version aligned.

## What Gets Published

The npm package is configured to publish:

- `dist/holi.js`
- `dist/holi.css` (optional compatibility stylesheet)
- `dist/components.html`
- `dist/layouts.html`
- `dist/styles/components/*.css`
- `dist/holi.html` (legacy compatibility bundle)
- `README.md`
- `CHANGELOG.md`
